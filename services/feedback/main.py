import os
import uuid
import jwt
import httpx
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import datetime, timedelta, date
from typing import List, Optional, Dict
from fastapi import FastAPI, Depends, HTTPException, status, Header, BackgroundTasks
from pydantic import BaseModel, Field
from sqlalchemy import create_engine, Column, String, Integer, DateTime, ForeignKey, func, and_, select, Numeric, Date
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.exc import IntegrityError
from apscheduler.schedulers.background import BackgroundScheduler

# Configs
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://feedback_user:feedback_secure_pass@db-feedback:5432/dineiq_feedback")
PUBLIC_KEY_PATH = os.getenv("JWT_PUBLIC_KEY_PATH", "/app/keys/jwt_public.pem")
LLM_API_KEY = os.getenv("LLM_API_KEY", "") # Groq or Gemini API key
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "groq") # 'groq' or 'gemini'
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.mailtrap.io")
SMTP_PORT = int(os.getenv("SMTP_PORT", "2525"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")

# Fallback default public key
DEFAULT_PUBLIC_KEY = """-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA8MwF4xCt/ddEGEyAexAC
Z2pLbRX00NHBsu1kk5ts548oE4AIku80plwxgzcy+hLY1m1RQKQFx6Jmr/73r0YO
0WpHC23J72r7zK1iB5A6CULC/9vR4m7TfDcqWpLh9Gl3t4y87t3W3+CT7IkDEq3Q
VASQPhh8r+OJcJYCE0nHxayzPXIjpQhvg7/EpFHczYhCgDZkQpu7yeHixEoL0Tqg
BugISgo2TrHhk++hq/NV/KEJ3IB0bbMas9ESxMr463W8Ci3j5TYrGtmgUsGGkWYC
ENyyjFOklRhE13iOMe4uUQiQI10TXybKNZZIdKVL1do6sp0JMFeML+0UwlZ6yeH7
GQIDAQAB
-----END PUBLIC KEY-----"""

# Read public key
try:
    if os.path.exists(PUBLIC_KEY_PATH):
        with open(PUBLIC_KEY_PATH, "r") as f:
            PUBLIC_KEY = f.read()
    else:
        PUBLIC_KEY = DEFAULT_PUBLIC_KEY
except Exception:
    PUBLIC_KEY = DEFAULT_PUBLIC_KEY

# DB Setup
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# SQLAlchemy Models
class Review(Base):
    __tablename__ = "reviews"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(String(50), nullable=False)
    outlet_id = Column(String(50), nullable=False)
    platform = Column(String(50), nullable=False) # 'Google', 'Zomato', 'Swiggy'
    platform_review_id = Column(String(255), nullable=False)
    rating = Column(Numeric(3, 2), nullable=False)
    review_text = Column(String)
    sentiment = Column(String(50), default="NEUTRAL", nullable=False) # 'POSITIVE', 'NEUTRAL', 'NEGATIVE'
    triage_status = Column(String(50), default="PENDING", nullable=False) # 'PENDING', 'PROCESSED', 'FAILED'
    review_date = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

class ReviewTheme(Base):
    __tablename__ = "review_themes"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    review_id = Column(UUID(as_uuid=True), ForeignKey("reviews.id"), nullable=False)
    theme = Column(String(100), nullable=False) # 'FOOD_QUALITY', 'SERVICE_SPEED', 'CLEANLINESS', 'VALUE_FOR_MONEY', 'STAFF_BEHAVIOR', 'AMBIENCE'
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

class SatisfactionSnapshot(Base):
    __tablename__ = "satisfaction_snapshots"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(String(50), nullable=False)
    outlet_id = Column(String(50), nullable=False)
    snapshot_date = Column(Date, nullable=False)
    average_score = Column(Numeric(4, 2), default=0.00, nullable=False)
    total_reviews = Column(Integer, default=0, nullable=False)
    positive_count = Column(Integer, default=0, nullable=False)
    neutral_count = Column(Integer, default=0, nullable=False)
    negative_count = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

class AlertLog(Base):
    __tablename__ = "alert_log"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(String(50), nullable=False)
    outlet_id = Column(String(50), nullable=False)
    alert_type = Column(String(100), nullable=False) # 'NEGATIVE_SPIKE'
    message = Column(String, nullable=False)
    triggered_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    cooldown_until = Column(DateTime(timezone=True), nullable=False)

# FastAPI Init
app = FastAPI(title="DineIQ Customer Feedback Aggregator API")

@app.get("/health")
def health_check():
    return {"status": "UP", "service": "feedback-service"}


# Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# JWT Verification Dependency
def verify_jwt(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token format")
    token = authorization.split(" ")[1]
    try:
        payload = jwt.decode(token, PUBLIC_KEY, algorithms=["RS256"])
        return payload
    except jwt.PyJWTError as err:
        raise HTTPException(status_code=401, detail=f"Token verification failed: {str(err)}")

# Pydantic schemas
class ReviewIntakeItem(BaseModel):
    platform_review_id: str
    rating: float = Field(..., ge=1.0, le=5.0)
    review_text: str
    review_date: datetime

class FeedbackIngestPayload(BaseModel):
    tenant_id: str
    outlet_id: str
    platform: str # 'Google', 'Zomato', 'Swiggy'
    reviews: List[ReviewIntakeItem]

# --- NLP ANALYSIS PIPELINE (BATCH LLM PARSER) ---
async def process_nlp_triage_batch(db: Session, tenant_id: str, outlet_id: str, reviews_to_process: List[Review]):
    if not reviews_to_process:
        return
        
    # Batch size limit: 50
    batch = reviews_to_process[:50]
    
    # Constructing prompt data payload
    prompt_entries = [{"id": str(r.id), "text": r.review_text} for r in batch if r.review_text]
    
    if not prompt_entries:
        # No review text to analyze; auto-set to NEUTRAL and processed
        for r in batch:
            r.sentiment = "NEUTRAL"
            r.triage_status = "PROCESSED"
        db.commit()
        return

    # Strict JSON formatting prompt for Groq/Gemini completion API
    prompt = f"""
    Analyze the sentiment and key themes of the following customer restaurant reviews.
    Return ONLY a valid JSON array of objects with the exact schema:
    [
      {{
        "id": "review_uuid",
        "sentiment": "POSITIVE" | "NEUTRAL" | "NEGATIVE",
        "themes": ["FOOD_QUALITY" | "SERVICE_SPEED" | "CLEANLINESS" | "VALUE_FOR_MONEY" | "STAFF_BEHAVIOR" | "AMBIENCE"]
      }}
    ]
    
    Reviews:
    {prompt_entries}
    """
    
    success = False
    llm_response_data = []

    # Call external LLM if API Key is configured
    if LLM_API_KEY:
        try:
            async with httpx.AsyncClient() as client:
                if LLM_PROVIDER == "groq":
                    res = await client.post(
                        "https://api.groq.com/openai/v1/chat/completions",
                        headers={"Authorization": f"Bearer {LLM_API_KEY}"},
                        json={
                            "model": "llama3-70b-8192",
                            "messages": [{"role": "user", "content": prompt}],
                            "temperature": 0.1,
                            "response_format": {"type": "json_object"}
                        },
                        timeout=10.0
                    )
                    if res.status_code == 200:
                        content = res.json()["choices"][0]["message"]["content"]
                        llm_response_data = json.loads(content)
                        success = True
                elif LLM_PROVIDER == "gemini":
                    res = await client.post(
                        f"https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key={LLM_API_KEY}",
                        json={
                            "contents": [{"parts": [{"text": prompt}]}],
                            "generationConfig": {"responseMimeType": "application/json"}
                        },
                        timeout=10.0
                    )
                    if res.status_code == 200:
                        content = res.json()["candidates"][0]["content"]["parts"][0]["text"]
                        llm_response_data = json.loads(content)
                        success = True
        except Exception as e:
            print(f"LLM API call failed: {e}")

    # Fallback / Mock processing if LLM is offline or no API Key
    if not success:
        print("Bypassing external LLM. Executing deterministic fallback classifier...")
        # Deterministic mock/fallback processing rules
        for r in batch:
            text = (r.review_text or "").lower()
            sentiment = "NEUTRAL"
            themes = []
            
            # Simple keyword matching
            if any(w in text for w in ["good", "great", "excellent", "delicious", "love"]):
                sentiment = "POSITIVE"
            elif any(w in text for w in ["bad", "cold", "slow", "poor", "dirty", "worst", "horrible"]):
                sentiment = "NEGATIVE"
                
            if any(w in text for w in ["steak", "burger", "salad", "food", "taste", "delicious", "flavor"]):
                themes.append("FOOD_QUALITY")
            if any(w in text for w in ["slow", "fast", "wait", "minutes", "speed", "quick"]):
                themes.append("SERVICE_SPEED")
            if any(w in text for w in ["clean", "dirty", "dusty", "hygiene"]):
                themes.append("CLEANLINESS")
                
            llm_response_data.append({
                "id": str(r.id),
                "sentiment": sentiment,
                "themes": themes
            })

    # Commit results to db
    try:
        response_map = {item["id"]: item for item in llm_response_data if "id" in item}
        for r in batch:
            r_id_str = str(r.id)
            if r_id_str in response_map:
                analysis = response_map[r_id_str]
                r.sentiment = analysis.get("sentiment", "NEUTRAL")
                r.triage_status = "PROCESSED"
                
                # Save themes
                for theme_name in analysis.get("themes", []):
                    # Check matching enum validation
                    if theme_name in ['FOOD_QUALITY', 'SERVICE_SPEED', 'CLEANLINESS', 'VALUE_FOR_MONEY', 'STAFF_BEHAVIOR', 'AMBIENCE']:
                        db.add(ReviewTheme(review_id=r.id, theme=theme_name))
            else:
                # Keep in PENDING triage state
                r.triage_status = "FAILED"
                
        db.commit()
        
        # Trigger spike logic checking for the newly triage processed reviews
        run_negative_spike_detector(db, tenant_id, outlet_id)
        # Update Daily snapshots
        update_daily_snapshots(db, tenant_id, outlet_id, batch)
        
    except Exception as err:
        db.rollback()
        print(f"Failed committing NLP batch results: {err}")
        for r in batch:
            r.triage_status = "FAILED"
        db.commit()

# Helper: Triage retry background task
def retry_failed_nlp_triage(db: Session):
    failed_reviews = db.query(Review).filter(Review.triage_status.in_(["FAILED", "PENDING"])).all()
    if failed_reviews:
        # Group by tenant/outlet and execute batch process
        groups = {}
        for r in failed_reviews:
            key = (r.tenant_id, r.outlet_id)
            if key not in groups:
                groups[key] = []
            groups[key].append(r)
            
        for (t_id, o_id), r_list in groups.items():
            # Run processing inline in background thread
            import asyncio
            asyncio.run(process_nlp_triage_batch(db, t_id, o_id, r_list))

# --- NEGATIVE REVIEW SPIKE ENGINE ---
def run_negative_spike_detector(db: Session, tenant_id: str, outlet_id: str):
    # Rolling 1-hour window check
    one_hour_ago = datetime.utcnow() - timedelta(hours=1)
    
    negative_count = db.query(Review).filter(
        Review.tenant_id == tenant_id,
        Review.outlet_id == outlet_id,
        Review.sentiment == "NEGATIVE",
        Review.review_date >= one_hour_ago
    ).count()

    # Spike threshold: 3 negative reviews in 1 hour
    SPIKE_THRESHOLD = 3
    
    if negative_count >= SPIKE_THRESHOLD:
        # Check active alert cooldown
        now = datetime.utcnow()
        active_cooldown = db.query(AlertLog).filter(
            AlertLog.tenant_id == tenant_id,
            AlertLog.outlet_id == outlet_id,
            AlertLog.alert_type == "NEGATIVE_SPIKE",
            AlertLog.cooldown_until > now
        ).order_by(AlertLog.cooldown_until.desc()).first()
        
        if not active_cooldown:
            # Drop alert log
            cooldown_until = now + timedelta(hours=4) # 4-hour cooldown suppression rule
            alert = AlertLog(
                tenant_id=tenant_id,
                outlet_id=outlet_id,
                alert_type="NEGATIVE_SPIKE",
                message=f"CRITICAL: Negative review spike detected! Received {negative_count} negative reviews in the last hour.",
                cooldown_until=cooldown_until
            )
            db.add(alert)
            db.commit()
            
            # Dispatch Notification Packet (Mock dispatcher)
            alert_packet = {
                "event": "NEGATIVE_REVIEW_SPIKE_ALERT",
                "tenant_id": tenant_id,
                "outlet_id": outlet_id,
                "negative_reviews_count": negative_count,
                "cooldown_until": cooldown_until.isoformat(),
                "timestamp": now.isoformat()
            }
            print(f"NOTIFICATION ENGINE DISPATCHER: {alert_packet}")

# Helper: Update Daily Satisfaction Snapshots
def update_daily_snapshots(db: Session, tenant_id: str, outlet_id: str, processed_reviews: List[Review]):
    dates = set(r.review_date.date() for r in processed_reviews)
    for d in dates:
        # Sum current day metrics
        total = db.query(Review).filter(
            Review.tenant_id == tenant_id,
            Review.outlet_id == outlet_id,
            Review.triage_status == "PROCESSED",
            func.date(Review.review_date) == d
        ).count()
        
        avg_score_scalar = db.query(func.avg(Review.rating)).filter(
            Review.tenant_id == tenant_id,
            Review.outlet_id == outlet_id,
            Review.triage_status == "PROCESSED",
            func.date(Review.review_date) == d
        ).scalar()
        
        pos = db.query(Review).filter(
            Review.tenant_id == tenant_id,
            Review.outlet_id == outlet_id,
            Review.sentiment == "POSITIVE",
            func.date(Review.review_date) == d
        ).count()
        
        neut = db.query(Review).filter(
            Review.tenant_id == tenant_id,
            Review.outlet_id == outlet_id,
            Review.sentiment == "NEUTRAL",
            func.date(Review.review_date) == d
        ).count()
        
        neg = db.query(Review).filter(
            Review.tenant_id == tenant_id,
            Review.outlet_id == outlet_id,
            Review.sentiment == "NEGATIVE",
            func.date(Review.review_date) == d
        ).count()
        
        snapshot = db.query(SatisfactionSnapshot).filter(
            SatisfactionSnapshot.tenant_id == tenant_id,
            SatisfactionSnapshot.outlet_id == outlet_id,
            SatisfactionSnapshot.snapshot_date == d
        ).first()
        
        if not snapshot:
            snapshot = SatisfactionSnapshot(
                tenant_id=tenant_id,
                outlet_id=outlet_id,
                snapshot_date=d
            )
            db.add(snapshot)
            
        snapshot.average_score = float(avg_score_scalar) if avg_score_scalar else 0.00
        snapshot.total_reviews = total
        snapshot.positive_count = pos
        snapshot.neutral_count = neut
        snapshot.negative_count = neg
        
    db.commit()

# --- WEEKLY DIGEST SCHEDULER & SMTP GATEWAY ---
def compile_weekly_digest(db_session_factory):
    db = db_session_factory()
    try:
        # Fetch all unique tenant/outlets
        outlets_query = db.query(Review.tenant_id, Review.outlet_id).distinct().all()
        
        for tenant_id, outlet_id in outlets_query:
            # Query metrics for last 7 days
            one_week_ago = datetime.utcnow() - timedelta(days=7)
            
            total_count = db.query(Review).filter(
                Review.tenant_id == tenant_id,
                Review.outlet_id == outlet_id,
                Review.review_date >= one_week_ago
            ).count()
            
            avg_rating = db.query(func.avg(Review.rating)).filter(
                Review.tenant_id == tenant_id,
                Review.outlet_id == outlet_id,
                Review.review_date >= one_week_ago
            ).scalar()
            
            pos_count = db.query(Review).filter(
                Review.tenant_id == tenant_id,
                Review.outlet_id == outlet_id,
                Review.sentiment == "POSITIVE",
                Review.review_date >= one_week_ago
            ).count()

            neg_count = db.query(Review).filter(
                Review.tenant_id == tenant_id,
                Review.outlet_id == outlet_id,
                Review.sentiment == "NEGATIVE",
                Review.review_date >= one_week_ago
            ).count()
            
            # Format clean HTML Layout
            html_content = f"""
            <html>
              <body style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                <h2 style="color: #4f46e5;">DineIQ Weekly Feedback Digest</h2>
                <p>Metrics summary for the last 7 days (Tenant: <strong>{tenant_id}</strong>, Outlet: <strong>{outlet_id}</strong>):</p>
                <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
                  <tr style="background-color: #f3f4f6;">
                    <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Metric</th>
                    <th style="padding: 10px; border: 1px solid #ddd; text-align: right;">Value</th>
                  </tr>
                  <tr>
                    <td style="padding: 10px; border: 1px solid #ddd;">Total Reviews Received</td>
                    <td style="padding: 10px; border: 1px solid #ddd; text-align: right;"><strong>{total_count}</strong></td>
                  </tr>
                  <tr>
                    <td style="padding: 10px; border: 1px solid #ddd;">Average Rating</td>
                    <td style="padding: 10px; border: 1px solid #ddd; text-align: right;"><strong>{float(avg_rating or 0.00):.2f} / 5.00</strong></td>
                  </tr>
                  <tr>
                    <td style="padding: 10px; border: 1px solid #ddd; color: #16a34a;">Positive Reviews</td>
                    <td style="padding: 10px; border: 1px solid #ddd; text-align: right; color: #16a34a;">{pos_count}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px; border: 1px solid #ddd; color: #dc2626;">Negative Reviews</td>
                    <td style="padding: 10px; border: 1px solid #ddd; text-align: right; color: #dc2626;">{neg_count}</td>
                  </tr>
                </table>
                <br>
                <p style="font-size: 12px; color: #6b7280;">This digest was compiled automatically by DineIQ Feedback Engine.</p>
              </body>
            </html>
            """
            
            # Send via SMTP connection
            try:
                # Construct email
                msg = MIMEMultipart()
                msg['From'] = "digest@dineiq.com"
                msg['To'] = f"manager@{tenant_id}.com"
                msg['Subject'] = f"DineIQ Weekly Feedback Digest - {outlet_id}"
                msg.attach(MIMEText(html_content, 'html'))
                
                # Mock SMTP connection (or real logic if values provided)
                if SMTP_USER and SMTP_PASS:
                    server = smtplib.SMTP(SMTP_HOST, SMTP_PORT)
                    server.starttls()
                    server.login(SMTP_USER, SMTP_PASS)
                    server.sendmail(msg['From'], msg['To'], msg.as_string())
                    server.quit()
                    print(f"Weekly digest successfully sent via SMTP to {msg['To']}")
                else:
                    print(f"SMTP credentials missing. MOCK EMAIL LOGOUT:\n{msg.as_string()}")
            except Exception as mail_err:
                print(f"Failed to send weekly digest email: {mail_err}")
                
    except Exception as e:
        print(f"Weekly digest compilation failed: {e}")
    finally:
        db.close()

# APScheduler Config
scheduler = BackgroundScheduler()
# Executed every Monday at 07:00 UTC
scheduler.add_job(
    compile_weekly_digest, 
    'cron', 
    day_of_week='mon', 
    hour=7, 
    minute=0, 
    args=[SessionLocal]
)
scheduler.start()

# --- API ENDPOINTS ---
@app.post("/api/v1/feedback/ingest")
def ingest_feedback(payload: FeedbackIngestPayload, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    if payload.platform not in ['Google', 'Zomato', 'Swiggy']:
        raise HTTPException(status_code=400, detail="Invalid review platform. Must be Google, Zomato, or Swiggy")
        
    ingested_reviews = []
    
    for item in payload.reviews:
        # Deduplication check: UNIQUE (tenant_id, platform, platform_review_id)
        exists = db.query(Review).filter(
            Review.tenant_id == payload.tenant_id,
            Review.platform == payload.platform,
            Review.platform_review_id == item.platform_review_id
        ).first()
        
        if exists:
            # Skip duplicate ingestion
            continue
            
        r = Review(
            tenant_id=payload.tenant_id,
            outlet_id=payload.outlet_id,
            platform=payload.platform,
            platform_review_id=item.platform_review_id,
            rating=item.rating,
            review_text=item.review_text,
            triage_status="PENDING",
            review_date=item.review_date
        )
        db.add(r)
        ingested_reviews.append(r)
        
    try:
        db.commit()
        
        # Trigger NLP batch process in background
        if ingested_reviews:
            background_tasks.add_task(
                process_nlp_triage_batch, 
                db, 
                payload.tenant_id, 
                payload.outlet_id, 
                ingested_reviews
            )
            
        return {
            "status": "SUCCESS", 
            "ingested_count": len(ingested_reviews),
            "skipped_duplicates": len(payload.reviews) - len(ingested_reviews)
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to ingest: {str(e)}")

# GET /api/v1/feedback/reviews & sentiment
@app.get("/api/v1/feedback/reviews")
def get_feedback_reviews(
    tenant_id: str,
    outlet_id: str,
    platform: Optional[str] = None,
    sentiment: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(Review).filter(Review.tenant_id == tenant_id, Review.outlet_id == outlet_id)
    if platform:
        query = query.filter(Review.platform == platform)
    if sentiment:
        query = query.filter(Review.sentiment == sentiment)
        
    reviews_list = query.order_by(Review.review_date.desc()).all()
    
    # Calculate rolling sentiment scores
    total = len(reviews_list)
    positive = sum(1 for r in reviews_list if r.sentiment == "POSITIVE")
    neutral = sum(1 for r in reviews_list if r.sentiment == "NEUTRAL")
    negative = sum(1 for r in reviews_list if r.sentiment == "NEGATIVE")
    
    rolling_sentiment = {
        "positive_ratio": positive / total if total > 0 else 0.0,
        "neutral_ratio": neutral / total if total > 0 else 0.0,
        "negative_ratio": negative / total if total > 0 else 0.0
    }
    
    return {
        "reviews": reviews_list,
        "rolling_sentiment": rolling_sentiment
    }

# Trigger retry endpoint (or manual check)
@app.post("/api/v1/feedback/retry-triage")
def trigger_retry_triage(db: Session = Depends(get_db)):
    retry_failed_nlp_triage(db)
    return {"status": "SUCCESS", "message": "Triggered triage check."}

import os
import uuid
import jwt
import redis
import json
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, status, Header
from pydantic import BaseModel, EmailStr
from sqlalchemy import create_engine, Column, String, Integer, DateTime, ForeignKey, update, func, and_
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from sqlalchemy.dialects.postgresql import UUID

# Configs
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://reservation_user:reservation_secure_pass@db-reservation:5432/dineiq_reservation")
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
PUBLIC_KEY_PATH = os.getenv("JWT_PUBLIC_KEY_PATH", "/app/keys/jwt_public.pem")

# Fallback default public key for local building/standalone testing
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

# Redis Setup
redis_client = redis.from_url(REDIS_URL, decode_responses=True)

# SQLAlchemy Models
class Table(Base):
    __tablename__ = "tables"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(String(50), nullable=False)
    outlet_id = Column(String(50), nullable=False)
    table_number = Column(String(20), nullable=False)
    capacity = Column(Integer, nullable=False)
    area_name = Column(String(100), nullable=False)
    status = Column(String(50), default="Available", nullable=False) # 'Available', 'Reserved', 'Occupied'
    version = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

class Reservation(Base):
    __tablename__ = "reservations"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(String(50), nullable=False)
    outlet_id = Column(String(50), nullable=False)
    table_id = Column(UUID(as_uuid=True), ForeignKey("tables.id"), nullable=False)
    guest_name = Column(String(100), nullable=False)
    guest_email = Column(String(255), nullable=False)
    guest_phone = Column(String(50), nullable=False)
    party_size = Column(Integer, nullable=False)
    start_time = Column(DateTime(timezone=True), nullable=False)
    end_time = Column(DateTime(timezone=True), nullable=False)
    status = Column(String(50), default="Reserved", nullable=False) # 'Reserved', 'Seated', 'Cleared', 'No Show', 'Cancelled'
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

class WaitlistEntry(Base):
    __tablename__ = "waitlist_entries"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(String(50), nullable=False)
    outlet_id = Column(String(50), nullable=False)
    guest_name = Column(String(100), nullable=False)
    guest_phone = Column(String(50), nullable=False)
    party_size = Column(Integer, nullable=False)
    status = Column(String(50), default="Waiting", nullable=False) # 'Waiting', 'Seated', 'Cancelled'
    estimated_wait_minutes = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

class ReservationAnalyticsSnapshot(Base):
    __tablename__ = "reservation_analytics_snapshots"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(String(50), nullable=False)
    outlet_id = Column(String(50), nullable=False)
    snapshot_time = Column(DateTime(timezone=True), nullable=False)
    total_reservations = Column(Integer, default=0, nullable=False)
    cancellations = Column(Integer, default=0, nullable=False)
    no_shows = Column(Integer, default=0, nullable=False)
    seated_count = Column(Integer, default=0, nullable=False)
    average_turnover_minutes = Column(Integer, default=45, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

# FastAPI init
app = FastAPI(title="DineIQ Table Reservation & Waitlist API")

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
class ReservationCreate(BaseModel):
    tenant_id: str
    outlet_id: str
    table_id: str
    guest_name: str
    guest_email: EmailStr
    guest_phone: str
    party_size: int
    start_time: datetime
    end_time: datetime

class WaitlistCreate(BaseModel):
    tenant_id: str
    outlet_id: str
    guest_name: str
    guest_phone: str
    party_size: int

class StatusUpdate(BaseModel):
    status: str

class NotificationCreate(BaseModel):
    tenant_id: str
    outlet_id: str
    type: str
    recipient: str
    message: str

# Helper: Update Redis Real-Time Table Status Cache
def update_table_cache(tenant_id: str, outlet_id: str, table_id: str, status: str):
    try:
        cache_key = f"dineiq:tenant:{tenant_id}:outlet:{outlet_id}:table:{table_id}:status"
        redis_client.set(cache_key, status)
        # Also log updates to a real-time tracking set/hash
        redis_client.hset(f"dineiq:tenant:{tenant_id}:outlet:{outlet_id}:tables_status", table_id, status)
    except Exception as e:
        print(f"Failed to update table cache in Redis: {e}")

# Helper: Push simulated SMS/Notification log
def push_notification_log(tenant_id: str, outlet_id: str, type_: str, recipient: str, message: str):
    try:
        notification = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "type": type_,
            "recipient": recipient,
            "message": message
        }
        key = f"dineiq:tenant:{tenant_id}:outlet:{outlet_id}:notifications"
        redis_client.lpush(key, json.dumps(notification))
        redis_client.ltrim(key, 0, 99) # limit to 100 entries
        print(f"Logged notification to Redis: {type_} for {recipient}")
    except Exception as e:
        print(f"Failed to write notification to Redis: {e}")

# Helper: Queue Delayed BullMQ Job for No-Show check (15 minutes past start_time)
def queue_noshow_check(reservation_id: str, start_time: datetime):
    try:
        # Scheduled check is start_time + 15 mins
        check_time = start_time + timedelta(minutes=15)
        delay_ms = int((check_time.replace(tzinfo=None) - datetime.utcnow()).total_seconds() * 1000)
        
        if delay_ms < 0:
            delay_ms = 0
            
        timestamp_ms = int((datetime.utcnow() + timedelta(milliseconds=delay_ms)).timestamp() * 1000)
        job_id = f"noshow:{reservation_id}"
        
        job_data = {
            "id": job_id,
            "name": "check-no-show",
            "data": json.dumps({"reservationId": reservation_id}),
            "opts": json.dumps({"delay": delay_ms, "timestamp": timestamp_ms}),
            "timestamp": timestamp_ms,
            "delay": delay_ms
        }
        
        # Write to BullMQ Redis structure
        redis_client.hset(f"bull:no-show-queue:jobs:{job_id}", mapping=job_data)
        redis_client.zadd("bull:no-show-queue:delayed", {job_id: timestamp_ms})
        
        print(f"Queued delayed BullMQ job in Redis for reservation {reservation_id} with delay {delay_ms}ms")
    except Exception as e:
        print(f"Failed to queue BullMQ no-show job: {e}")

# Helper: Queue Delayed BullMQ Job for reservation reminder (15 seconds delay for simulation)
def queue_reminder(reservation_id: str, tenant_id: str, outlet_id: str):
    try:
        delay_ms = 15000 # 15 seconds for simulation demonstration
        timestamp_ms = int((datetime.utcnow() + timedelta(milliseconds=delay_ms)).timestamp() * 1000)
        job_id = f"reminder:{reservation_id}"
        
        job_data = {
            "id": job_id,
            "name": "send-reminder",
            "data": json.dumps({"reservationId": reservation_id}),
            "opts": json.dumps({"delay": delay_ms, "timestamp": timestamp_ms}),
            "timestamp": timestamp_ms,
            "delay": delay_ms
        }
        
        # Write to BullMQ Redis structure
        redis_client.hset(f"bull:no-show-queue:jobs:{job_id}", mapping=job_data)
        redis_client.zadd("bull:no-show-queue:delayed", {job_id: timestamp_ms})
        
        print(f"Queued delayed reminder job in Redis for reservation {reservation_id} with delay {delay_ms}ms")
    except Exception as e:
        print(f"Failed to queue reminder job: {e}")

# Helper: Increment Analytics in Snapshot
def increment_analytics(db: Session, tenant_id: str, outlet_id: str, metric: str, amount: int = 1):
    try:
        now = datetime.utcnow()
        # Find snapshot for current hour
        current_hour = now.replace(minute=0, second=0, microsecond=0)
        
        snapshot = db.query(ReservationAnalyticsSnapshot).filter(
            ReservationAnalyticsSnapshot.tenant_id == tenant_id,
            ReservationAnalyticsSnapshot.outlet_id == outlet_id,
            ReservationAnalyticsSnapshot.snapshot_time == current_hour
        ).first()
        
        if not snapshot:
            snapshot = ReservationAnalyticsSnapshot(
                tenant_id=tenant_id,
                outlet_id=outlet_id,
                snapshot_time=current_hour,
                total_reservations=0,
                cancellations=0,
                no_shows=0,
                seated_count=0,
                average_turnover_minutes=45
            )
            db.add(snapshot)
            db.flush()
            
        if metric == "total_reservations":
            snapshot.total_reservations += amount
        elif metric == "cancellations":
            snapshot.cancellations += amount
        elif metric == "no_shows":
            snapshot.no_shows += amount
        elif metric == "seated_count":
            snapshot.seated_count += amount
            
        db.commit()
    except Exception as e:
        print(f"Failed to update analytics: {e}")

# Endpoints
@app.get("/health")
def health():
    return {"status": "UP", "service": "reservation-service"}

@app.post("/api/v1/reservations")
def create_reservation(payload: ReservationCreate, db: Session = Depends(get_db)):
    # 1. Parse dates and check inputs
    start_time = payload.start_time
    end_time = payload.end_time
    
    if start_time >= end_time:
        raise HTTPException(status_code=400, detail="start_time must be before end_time")
        
    table_uuid = uuid.UUID(payload.table_id)
    
    # 2. Get table and check capacity
    table = db.query(Table).filter(Table.id == table_uuid).first()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
        
    if table.capacity < payload.party_size:
        raise HTTPException(status_code=400, detail=f"Table capacity {table.capacity} is too small for party size {payload.party_size}")
        
    # 3. Check for overlapping reservations
    overlapping = db.query(Reservation).filter(
        Reservation.table_id == table_uuid,
        Reservation.status.in_(["Reserved", "Seated"]),
        and_(
            Reservation.start_time < end_time,
            Reservation.end_time > start_time
        )
    ).first()
    
    if overlapping:
        # Collision detected. Generate 3 alternative slots on same or similar tables
        alt_slots = []
        # Shift timings: +1.5 hrs, +3 hrs, -1.5 hrs
        shifts = [90, 180, -90]
        
        # Find tables with matching capacity and area
        similar_tables = db.query(Table).filter(
            Table.tenant_id == payload.tenant_id,
            Table.outlet_id == payload.outlet_id,
            Table.capacity >= payload.party_size,
            Table.area_name == table.area_name
        ).all()
        
        for shift in shifts:
            potential_start = start_time + timedelta(minutes=shift)
            potential_end = end_time + timedelta(minutes=shift)
            
            # Check availability across similar tables
            available_table = None
            for s_table in similar_tables:
                col = db.query(Reservation).filter(
                    Reservation.table_id == s_table.id,
                    Reservation.status.in_(["Reserved", "Seated"]),
                    and_(
                        Reservation.start_time < potential_end,
                        Reservation.end_time > potential_start
                    )
                ).first()
                if not col:
                    available_table = s_table
                    break
            
            if available_table:
                alt_slots.append({
                    "table_id": str(available_table.id),
                    "table_number": available_table.table_number,
                    "area_name": available_table.area_name,
                    "start_time": potential_start.isoformat(),
                    "end_time": potential_end.isoformat()
                })
                if len(alt_slots) == 3:
                    break
                    
        raise HTTPException(
            status_code=409,
            detail={
                "error": "Table collision: Table is already reserved for the requested slot.",
                "alternative_slots": alt_slots
            }
        )
        
    # 4. Save reservation and enforce optimistic locking on table status/version
    try:
        # Verify and lock using version column
        current_version = table.version
        
        stmt = update(Table).where(
            Table.id == table_uuid,
            Table.version == current_version
        ).values(
            version=current_version + 1,
            status="Reserved",
            updated_at=func.now()
        )
        result = db.execute(stmt)
        
        if result.rowcount == 0:
            # Optimistic lock failed (concurrent modification of table metadata)
            raise HTTPException(status_code=409, detail="Transaction conflict. Please retry booking.")
            
        new_res = Reservation(
            tenant_id=payload.tenant_id,
            outlet_id=payload.outlet_id,
            table_id=table_uuid,
            guest_name=payload.guest_name,
            guest_email=payload.guest_email,
            guest_phone=payload.guest_phone,
            party_size=payload.party_size,
            start_time=start_time,
            end_time=end_time,
            status="Reserved"
        )
        db.add(new_res)
        db.commit()
        db.refresh(new_res)
        
        # Real-time state cache update
        update_table_cache(payload.tenant_id, payload.outlet_id, payload.table_id, "Reserved")
        
        # Queue no-show task exactly 15 minutes past start_time
        queue_noshow_check(str(new_res.id), start_time)
        
        # Queue reminder task to trigger in 15 seconds (simulation)
        queue_reminder(str(new_res.id), payload.tenant_id, payload.outlet_id)
        
        # Log notification
        push_notification_log(
            tenant_id=payload.tenant_id,
            outlet_id=payload.outlet_id,
            type_="Reservation Confirmed",
            recipient=f"{payload.guest_name} ({payload.guest_phone})",
            message=f"Hi {payload.guest_name}, your reservation at DineIQ for Table {table.table_number} is confirmed for {start_time.strftime('%I:%M %p')}. See you then!"
        )
        
        # Log manager notification
        push_notification_log(
            tenant_id=payload.tenant_id,
            outlet_id=payload.outlet_id,
            type_="New Reservation Received",
            recipient="Manager",
            message=f"New reservation received from {payload.guest_name} (Party of {payload.party_size}) for Table {table.table_number} at {start_time.strftime('%I:%M %p')}."
        )
        
        # Analytics hook
        increment_analytics(db, payload.tenant_id, payload.outlet_id, "total_reservations")
        
        return new_res
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database transaction failed: {str(e)}")

@app.get("/api/v1/tables/availability")
def get_tables_availability(
    tenant_id: str,
    outlet_id: str,
    area_name: Optional[str] = None,
    party_size: Optional[int] = None,
    db: Session = Depends(get_db)
):
    # Retrieve active/real-time cache state from Redis
    try:
        cached_data = redis_client.hgetall(f"dineiq:tenant:{tenant_id}:outlet:{outlet_id}:tables_status")
    except Exception:
        cached_data = {}

    query = db.query(Table).filter(Table.tenant_id == tenant_id, Table.outlet_id == outlet_id)
    if area_name:
        query = query.filter(Table.area_name == area_name)
    if party_size:
        query = query.filter(Table.capacity >= party_size)
        
    tables = query.all()
    results = []
    
    for t in tables:
        # Determine status: prioritize cache, fallback to database
        current_status = cached_data.get(str(t.id), t.status)
        
        # Retrieve upcoming bookings for this table
        now = datetime.utcnow()
        upcoming = db.query(Reservation).filter(
            Reservation.table_id == t.id,
            Reservation.status == "Reserved",
            Reservation.start_time >= now
        ).order_by(Reservation.start_time).limit(3).all()
        
        results.append({
            "table_id": str(t.id),
            "table_number": t.table_number,
            "capacity": t.capacity,
            "area_name": t.area_name,
            "status": current_status,
            "upcoming_bookings": [
                {
                    "reservation_id": str(r.id),
                    "start_time": r.start_time.isoformat(),
                    "end_time": r.end_time.isoformat()
                } for r in upcoming
            ]
        })
        
    return results

@app.post("/api/v1/waitlist")
def add_to_waitlist(payload: WaitlistCreate, db: Session = Depends(get_db)):
    # 1. Fetch tables in this outlet matching capacity
    matching_tables = db.query(Table).filter(
        Table.tenant_id == payload.tenant_id,
        Table.outlet_id == payload.outlet_id,
        Table.capacity >= payload.party_size
    ).all()
    
    matching_count = len(matching_tables)
    
    # 2. Fetch current waitlist entries waiting ahead of this request
    waiting_ahead = db.query(WaitlistEntry).filter(
        WaitlistEntry.tenant_id == payload.tenant_id,
        WaitlistEntry.outlet_id == payload.outlet_id,
        WaitlistEntry.status == "Waiting",
        WaitlistEntry.party_size <= payload.party_size + 2 # check comparable sizes
    ).count()
    
    # 3. Fetch average turnover time (from latest analytics snapshot, default is 45 mins)
    latest_snapshot = db.query(ReservationAnalyticsSnapshot).filter(
        ReservationAnalyticsSnapshot.tenant_id == payload.tenant_id,
        ReservationAnalyticsSnapshot.outlet_id == payload.outlet_id
    ).order_by(ReservationAnalyticsSnapshot.snapshot_time.desc()).first()
    
    avg_turnover = latest_snapshot.average_turnover_minutes if latest_snapshot else 45
    
    # Calculate estimated wait time
    # Formula: (Waiting ahead + 1) / (Matching tables count) * Average turnover / 2 (since arrivals are staggered)
    divisor = max(1, matching_count)
    estimated_wait = max(10, int(((waiting_ahead + 1) / divisor) * (avg_turnover / 2)))
    
    new_entry = WaitlistEntry(
        tenant_id=payload.tenant_id,
        outlet_id=payload.outlet_id,
        guest_name=payload.guest_name,
        guest_phone=payload.guest_phone,
        party_size=payload.party_size,
        status="Waiting",
        estimated_wait_minutes=estimated_wait
    )
    
    db.add(new_entry)
    db.commit()
    db.refresh(new_entry)
    
    push_notification_log(
        tenant_id=payload.tenant_id,
        outlet_id=payload.outlet_id,
        type_="Waitlist Confirmed",
        recipient=f"{payload.guest_name} ({payload.guest_phone})",
        message=f"Hi {payload.guest_name}, you've been added to the waitlist. Your estimated wait time is {estimated_wait} minutes."
    )
    
    return new_entry

@app.patch("/api/v1/reservations/{id}/status")
def update_reservation_status(id: str, payload: StatusUpdate, db: Session = Depends(get_db)):
    res_uuid = uuid.UUID(id)
    res = db.query(Reservation).filter(Reservation.id == res_uuid).first()
    
    if not res:
        raise HTTPException(status_code=404, detail="Reservation not found")
        
    old_status = res.status
    new_status = payload.status
    
    # Valid transitions:
    # Reserved -> Seated, Cancelled, No Show
    # Seated -> Cleared
    valid_transitions = {
        "Reserved": ["Seated", "Cancelled", "No Show"],
        "Seated": ["Cleared"],
        "Cancelled": [],
        "No Show": [],
        "Cleared": []
    }
    
    if new_status not in valid_transitions.get(old_status, []):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid state transition from {old_status} to {new_status}"
        )
        
    # Update reservation state
    res.status = new_status
    
    # Update corresponding table status state machine
    table = db.query(Table).filter(Table.id == res.table_id).first()
    if table:
        if new_status == "Seated":
            table.status = "Occupied"
            increment_analytics(db, res.tenant_id, res.outlet_id, "seated_count")
        elif new_status == "Cleared":
            table.status = "Cleaning"
        elif new_status == "Cancelled":
            table.status = "Available"
            increment_analytics(db, res.tenant_id, res.outlet_id, "cancellations")
            push_notification_log(
                tenant_id=res.tenant_id,
                outlet_id=res.outlet_id,
                type_="Reservation Cancelled",
                recipient=f"{res.guest_name} ({res.guest_phone})",
                message=f"Hi {res.guest_name}, your reservation for Table {table.table_number if table else ''} has been cancelled."
            )
        elif new_status == "No Show":
            table.status = "Available"
            increment_analytics(db, res.tenant_id, res.outlet_id, "no_shows")
            
        table.version += 1
        update_table_cache(res.tenant_id, res.outlet_id, str(table.id), table.status)
        
    db.commit()
    db.refresh(res)
    
    return res

@app.get("/api/v1/analytics/reservations")
def get_reservation_analytics(
    tenant_id: str,
    outlet_id: str,
    start_date: datetime,
    end_date: datetime,
    db: Session = Depends(get_db)
):
    # Total counts inside range
    total = db.query(Reservation).filter(
        Reservation.tenant_id == tenant_id,
        Reservation.outlet_id == outlet_id,
        Reservation.start_time >= start_date,
        Reservation.start_time <= end_date
    ).count()
    
    cancellations = db.query(Reservation).filter(
        Reservation.tenant_id == tenant_id,
        Reservation.outlet_id == outlet_id,
        Reservation.status == "Cancelled",
        Reservation.start_time >= start_date,
        Reservation.start_time <= end_date
    ).count()
    
    no_shows = db.query(Reservation).filter(
        Reservation.tenant_id == tenant_id,
        Reservation.outlet_id == outlet_id,
        Reservation.status == "No Show",
        Reservation.start_time >= start_date,
        Reservation.start_time <= end_date
    ).count()
    
    seated = db.query(Reservation).filter(
        Reservation.tenant_id == tenant_id,
        Reservation.outlet_id == outlet_id,
        Reservation.status == "Seated",
        Reservation.start_time >= start_date,
        Reservation.start_time <= end_date
    ).count()
    
    no_show_rate = (no_shows / total) if total > 0 else 0.0
    
    avg_guests_query = db.query(func.avg(Reservation.party_size)).filter(
        Reservation.tenant_id == tenant_id,
        Reservation.outlet_id == outlet_id,
        Reservation.start_time >= start_date,
        Reservation.start_time <= end_date
    ).scalar()
    average_guests = round(float(avg_guests_query), 1) if avg_guests_query else 0.0

    total_tables = db.query(Table).filter(
        Table.tenant_id == tenant_id,
        Table.outlet_id == outlet_id
    ).count()
    table_utilization = round((seated / max(1, total_tables)) * 100, 1)

    # Peak hour distributions
    # Group by hour
    peak_hours_query = db.query(
        func.extract('hour', Reservation.start_time).label('hour'),
        func.count(Reservation.id).label('count')
    ).filter(
        Reservation.tenant_id == tenant_id,
        Reservation.outlet_id == outlet_id,
        Reservation.start_time >= start_date,
        Reservation.start_time <= end_date
    ).group_by('hour').order_by('hour').all()
    
    peak_hours = {int(h): c for h, c in peak_hours_query}
    
    return {
        "tenant_id": tenant_id,
        "outlet_id": outlet_id,
        "total_reservations": total,
        "cancellations": cancellations,
        "no_shows": no_shows,
        "seated_count": seated,
        "no_show_rate": no_show_rate,
        "average_guests": average_guests,
        "table_utilization": table_utilization,
        "peak_hour_distribution": peak_hours
    }

# New endpoints for reservations, waitlist and notifications
@app.get("/api/v1/reservations")
def get_reservations(
    tenant_id: str,
    outlet_id: str,
    date: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(Reservation).filter(
        Reservation.tenant_id == tenant_id,
        Reservation.outlet_id == outlet_id
    )
    if status:
        query = query.filter(Reservation.status == status)
    if date:
        try:
            target_date = datetime.strptime(date, "%Y-%m-%d").date()
            start_dt = datetime.combine(target_date, datetime.min.time())
            end_dt = datetime.combine(target_date, datetime.max.time())
            query = query.filter(Reservation.start_time >= start_dt, Reservation.start_time <= end_dt)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format, use YYYY-MM-DD")
            
    reservations = query.order_by(Reservation.start_time).all()
    results = []
    for r in reservations:
        table = db.query(Table).filter(Table.id == r.table_id).first()
        results.append({
            "id": str(r.id),
            "tenant_id": r.tenant_id,
            "outlet_id": r.outlet_id,
            "table_id": str(r.table_id),
            "table_number": table.table_number if table else "Unknown",
            "guest_name": r.guest_name,
            "guest_email": r.guest_email,
            "guest_phone": r.guest_phone,
            "party_size": r.party_size,
            "start_time": r.start_time.isoformat(),
            "end_time": r.end_time.isoformat(),
            "status": r.status,
            "created_at": r.created_at.isoformat(),
            "updated_at": r.updated_at.isoformat()
        })
    return results

@app.get("/api/v1/waitlist")
def get_waitlist(
    tenant_id: str,
    outlet_id: str,
    status: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(WaitlistEntry).filter(
        WaitlistEntry.tenant_id == tenant_id,
        WaitlistEntry.outlet_id == outlet_id
    )
    if status:
        query = query.filter(WaitlistEntry.status == status)
        
    entries = query.order_by(WaitlistEntry.created_at.desc()).all()
    return entries

@app.patch("/api/v1/waitlist/{id}/status")
def update_waitlist_status(id: str, payload: StatusUpdate, db: Session = Depends(get_db)):
    entry_uuid = uuid.UUID(id)
    entry = db.query(WaitlistEntry).filter(WaitlistEntry.id == entry_uuid).first()
    
    if not entry:
        raise HTTPException(status_code=404, detail="Waitlist entry not found")
        
    old_status = entry.status
    new_status = payload.status
    
    if old_status != "Waiting":
        raise HTTPException(status_code=400, detail=f"Cannot update status of a waitlist entry that is {old_status}")
        
    if new_status not in ["Seated", "Cancelled"]:
        raise HTTPException(status_code=400, detail=f"Invalid status: {new_status}. Must be Seated or Cancelled")
        
    entry.status = new_status
    entry.updated_at = func.now()
    
    db.commit()
    db.refresh(entry)
    
    if new_status == "Cancelled":
        push_notification_log(
            tenant_id=entry.tenant_id,
            outlet_id=entry.outlet_id,
            type_="Waitlist Cancelled",
            recipient=f"{entry.guest_name} ({entry.guest_phone})",
            message=f"Hi {entry.guest_name}, your waitlist entry has been cancelled."
        )
        
    return entry

class SeatWaitlistPayload(BaseModel):
    table_id: str

@app.post("/api/v1/waitlist/{id}/seat")
def seat_waitlist_entry(id: str, payload: SeatWaitlistPayload, db: Session = Depends(get_db)):
    entry_uuid = uuid.UUID(id)
    entry = db.query(WaitlistEntry).filter(WaitlistEntry.id == entry_uuid).first()
    
    if not entry:
        raise HTTPException(status_code=404, detail="Waitlist entry not found")
        
    if entry.status != "Waiting":
        raise HTTPException(status_code=400, detail=f"Waitlist entry is already {entry.status}")
        
    table_uuid = uuid.UUID(payload.table_id)
    table = db.query(Table).filter(Table.id == table_uuid).first()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
        
    if table.capacity < entry.party_size:
        raise HTTPException(status_code=400, detail=f"Table capacity {table.capacity} is too small for party size {entry.party_size}")
        
    try:
        cached_status = redis_client.hget(f"dineiq:tenant:{entry.tenant_id}:outlet:{entry.outlet_id}:tables_status", payload.table_id)
    except Exception:
        cached_status = None
        
    current_status = cached_status if cached_status else table.status
    if current_status != "Available":
        raise HTTPException(status_code=409, detail=f"Table {table.table_number} is not available (status: {current_status})")
        
    try:
        current_version = table.version
        stmt = update(Table).where(
            Table.id == table_uuid,
            Table.version == current_version
        ).values(
            version=current_version + 1,
            status="Occupied",
            updated_at=func.now()
        )
        result = db.execute(stmt)
        if result.rowcount == 0:
            raise HTTPException(status_code=409, detail="Transaction conflict seating guest. Please retry.")
            
        entry.status = "Seated"
        entry.updated_at = func.now()
        
        now = datetime.utcnow()
        end_time = now + timedelta(minutes=45)
        
        new_res = Reservation(
            tenant_id=entry.tenant_id,
            outlet_id=entry.outlet_id,
            table_id=table_uuid,
            guest_name=entry.guest_name,
            guest_email=f"{entry.guest_name.lower().replace(' ', '')}@walkin.com",
            guest_phone=entry.guest_phone,
            party_size=entry.party_size,
            start_time=now,
            end_time=end_time,
            status="Seated"
        )
        db.add(new_res)
        db.commit()
        db.refresh(new_res)
        
        update_table_cache(entry.tenant_id, entry.outlet_id, payload.table_id, "Occupied")
        increment_analytics(db, entry.tenant_id, entry.outlet_id, "total_reservations")
        increment_analytics(db, entry.tenant_id, entry.outlet_id, "seated_count")
        
        push_notification_log(
            tenant_id=entry.tenant_id,
            outlet_id=entry.outlet_id,
            type_="Table Ready",
            recipient=f"{entry.guest_name} ({entry.guest_phone})",
            message=f"Hi {entry.guest_name}, your table {table.table_number} is ready! Please proceed to the host stand."
        )
        
        return {
            "waitlist_entry": entry,
            "reservation": new_res
        }
        
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database transaction failed: {str(e)}")

@app.get("/api/v1/reservations/notifications")
def get_notifications(tenant_id: str, outlet_id: str):
    try:
        notifications_json = redis_client.lrange(f"dineiq:tenant:{tenant_id}:outlet:{outlet_id}:notifications", 0, -1)
        return [json.loads(n) for n in notifications_json]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch notifications: {str(e)}")

@app.get("/api/v1/tables/free")
def get_free_tables(
    tenant_id: str,
    outlet_id: str,
    party_size: int,
    start_time: datetime,
    end_time: datetime,
    area_name: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(Table).filter(
        Table.tenant_id == tenant_id,
        Table.outlet_id == outlet_id,
        Table.capacity >= party_size
    )
    if area_name:
        query = query.filter(Table.area_name == area_name)
    tables = query.all()
    
    free_tables = []
    for t in tables:
        overlapping = db.query(Reservation).filter(
            Reservation.table_id == t.id,
            Reservation.status.in_(["Reserved", "Seated"]),
            and_(
                Reservation.start_time < end_time,
                Reservation.end_time > start_time
            )
        ).first()
        if not overlapping:
            is_cache_blocked = False
            now = datetime.utcnow()
            if start_time.replace(tzinfo=None) <= now + timedelta(minutes=15):
                try:
                    cached_status = redis_client.hget(f"dineiq:tenant:{tenant_id}:outlet:{outlet_id}:tables_status", str(t.id))
                    if cached_status in ["Occupied", "Cleaning"]:
                        is_cache_blocked = True
                except Exception:
                    pass
            if not is_cache_blocked:
                free_tables.append({
                    "table_id": str(t.id),
                    "table_number": t.table_number,
                    "capacity": t.capacity,
                    "area_name": t.area_name,
                    "status": t.status
                })
    return free_tables

@app.patch("/api/v1/tables/{id}/status")
def update_table_status(id: str, payload: StatusUpdate, db: Session = Depends(get_db)):
    table_uuid = uuid.UUID(id)
    table = db.query(Table).filter(Table.id == table_uuid).first()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    
    new_status = payload.status
    if new_status not in ["Available", "Reserved", "Occupied", "Cleaning"]:
        raise HTTPException(status_code=400, detail=f"Invalid status: {new_status}")
        
    table.status = new_status
    table.version += 1
    db.commit()
    db.refresh(table)
    
    update_table_cache(table.tenant_id, table.outlet_id, str(table.id), new_status)
    return {
        "table_id": str(table.id),
        "table_number": table.table_number,
        "status": table.status
    }

@app.post("/api/v1/reservations/notifications")
def create_notification(payload: NotificationCreate, db: Session = Depends(get_db)):
    push_notification_log(
        tenant_id=payload.tenant_id,
        outlet_id=payload.outlet_id,
        type_=payload.type,
        recipient=payload.recipient,
        message=payload.message
    )
    return {"status": "SUCCESS"}

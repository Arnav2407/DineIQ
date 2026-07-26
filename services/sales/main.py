import os
import uuid
import csv
import jwt
import httpx
from datetime import date, datetime, time, timedelta
from typing import List, Optional, Dict
from fastapi import FastAPI, Depends, HTTPException, status, Header, BackgroundTasks, Query
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, String, Integer, DateTime, ForeignKey, func, and_, select, Numeric, Date, Boolean, desc
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from sqlalchemy.dialects.postgresql import UUID

# Configs
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://sales_user:sales_secure_pass@db-sales:5432/dineiq_sales")
PUBLIC_KEY_PATH = os.getenv("JWT_PUBLIC_KEY_PATH", "/app/keys/jwt_public.pem")

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
class MenuItem(Base):
    __tablename__ = "menu_items"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(String(50), nullable=False)
    outlet_id = Column(String(50), nullable=False)
    sku = Column(String(50), nullable=False)
    name = Column(String(100), nullable=False)
    price = Column(Numeric(12, 2), nullable=False)
    cost = Column(Numeric(12, 2), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

class SalesTransaction(Base):
    __tablename__ = "sales_transactions"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(String(50), nullable=False)
    outlet_id = Column(String(50), nullable=False)
    transaction_id = Column(String(100), nullable=False)
    menu_item_id = Column(UUID(as_uuid=True), ForeignKey("menu_items.id"), nullable=False)
    quantity = Column(Integer, nullable=False)
    unit_price = Column(Numeric(12, 2), nullable=False)
    total_amount = Column(Numeric(12, 2), nullable=False)
    meal_period = Column(String(50)) # 'Breakfast', 'Lunch', 'Snacks', 'Dinner', 'Late Night'
    payment_method = Column(String(50), default="UPI") # 'UPI', 'Cash', 'Card'
    table_area = Column(String(50), default="Indoor") # 'Indoor', 'Outdoor', 'Family Hall', 'Rooftop', 'Bar'
    customer_count = Column(Integer, default=1)
    is_reservation = Column(Boolean, default=False)
    transaction_time = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

class POSSyncLog(Base):
    __tablename__ = "pos_sync_log"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(String(50), nullable=False)
    outlet_id = Column(String(50), nullable=False)
    sync_status = Column(String(50), nullable=False) # 'Success', 'Failed'
    records_synced = Column(Integer, default=0, nullable=False)
    error_message = Column(String, nullable=True)
    last_sync_time = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

class SalesTrendSnapshot(Base):
    __tablename__ = "sales_trend_snapshots"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(String(50), nullable=False)
    outlet_id = Column(String(50), nullable=False)
    snapshot_date = Column(Date, nullable=False)
    total_revenue = Column(Numeric(12, 2), default=0.00, nullable=False)
    total_orders = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

# FastAPI Init
app = FastAPI(title="DineIQ Daily Sales & Menu Performance Dashboard API")

# Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# JWT Decoder
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
class MenuItemCreate(BaseModel):
    tenant_id: str
    outlet_id: str
    sku: str
    name: str
    price: float
    cost: float

class MenuItemUpdate(BaseModel):
    name: Optional[str] = None
    price: Optional[float] = None
    cost: Optional[float] = None

class CustomerBillItem(BaseModel):
    sku: str
    quantity: int
    unit_price: Optional[float] = None

class CustomerBillCreate(BaseModel):
    tenant_id: str
    outlet_id: str
    transaction_id: str # e.g. "INV-1001"
    payment_method: str # 'UPI', 'Cash', 'Card'
    table_area: str # 'Indoor', 'Outdoor', 'Family Hall', 'Rooftop', 'Bar'
    customer_count: Optional[int] = 1
    is_reservation: Optional[bool] = False
    items: List[CustomerBillItem]

class POSSyncCSVPayload(BaseModel):
    tenant_id: str
    outlet_id: str
    csv_data: str

class POSSyncJSONItem(BaseModel):
    sku: str
    quantity: int
    unit_price: float

class POSSyncJSONTransaction(BaseModel):
    transaction_id: str
    transaction_time: datetime
    payment_method: Optional[str] = "UPI"
    table_area: Optional[str] = "Indoor"
    customer_count: Optional[int] = 1
    is_reservation: Optional[bool] = False
    items: List[POSSyncJSONItem]

class POSSyncJSONPayload(BaseModel):
    tenant_id: str
    outlet_id: str
    transactions: List[POSSyncJSONTransaction]

# Meal Period Classifier
def classify_meal_period(transaction_time: datetime) -> str:
    # Breakfast: 06:00 - 11:00
    # Lunch: 11:00 - 16:00
    # Snacks: 16:00 - 19:00
    # Dinner: 19:00 - 23:00
    # Late Night: 23:00 - 06:00
    t = transaction_time.time()
    if time(6, 0) <= t < time(11, 0):
        return "Breakfast"
    elif time(11, 0) <= t < time(16, 0):
        return "Lunch"
    elif time(16, 0) <= t < time(19, 0):
        return "Snacks"
    elif time(19, 0) <= t < time(23, 0):
        return "Dinner"
    else:
        return "Late Night"

# Helper: Sync Failure Sentinel Alert System
def check_sync_sentinel_alert(db: Session, tenant_id: str, outlet_id: str) -> dict:
    last_success = db.query(POSSyncLog).filter(
        POSSyncLog.tenant_id == tenant_id,
        POSSyncLog.outlet_id == outlet_id,
        POSSyncLog.sync_status == "Success"
    ).order_by(POSSyncLog.last_sync_time.desc()).first()
    
    now = datetime.now(last_success.last_sync_time.tzinfo) if last_success else datetime.utcnow()
    
    is_offline = False
    minutes_offline = 0
    
    if not last_success:
        is_offline = True
        minutes_offline = 9999
    else:
        time_diff = now - last_success.last_sync_time
        minutes_offline = int(time_diff.total_seconds() / 60)
        if minutes_offline > 30:
            is_offline = True
            
    alert_packet = None
    if is_offline:
        alert_packet = {
            "event": "SYNC_FAILURE_ALERT",
            "tenant_id": tenant_id,
            "outlet_id": outlet_id,
            "last_sync_time": last_success.last_sync_time.isoformat() if last_success else None,
            "minutes_offline": minutes_offline,
            "severity": "CRITICAL",
            "message": f"POS Sync connection has been offline for {minutes_offline} minutes. Action required.",
            "timestamp": datetime.utcnow().isoformat()
        }
        
    return {
        "sync_offline": is_offline,
        "minutes_offline": minutes_offline,
        "alert_packet": alert_packet
    }

# Helper: Update Daily Snapshot
def update_daily_snapshot(db: Session, tenant_id: str, outlet_id: str, trans_date: date, revenue: float):
    snapshot = db.query(SalesTrendSnapshot).filter(
        SalesTrendSnapshot.tenant_id == tenant_id,
        SalesTrendSnapshot.outlet_id == outlet_id,
        SalesTrendSnapshot.snapshot_date == trans_date
    ).first()
    
    if not snapshot:
        snapshot = SalesTrendSnapshot(
            tenant_id=tenant_id,
            outlet_id=outlet_id,
            snapshot_date=trans_date,
            total_revenue=0.00,
            total_orders=0
        )
        db.add(snapshot)
        db.flush()
        
    snapshot.total_revenue += float(revenue)
    snapshot.total_orders += 1
    db.commit()

# Endpoints
@app.get("/health")
def health(tenant_id: Optional[str] = None, outlet_id: Optional[str] = None, db: Session = Depends(get_db)):
    sync_status = {}
    if tenant_id and outlet_id:
        sync_status = check_sync_sentinel_alert(db, tenant_id, outlet_id)
        
    return {
        "status": "UP", 
        "service": "sales-service",
        "sync_sentinel": sync_status
    }

# --- MENU ITEMS CRUD ---
@app.get("/api/v1/sales/menu-items")
def list_menu_items(tenant_id: str, outlet_id: str, db: Session = Depends(get_db)):
    return db.query(MenuItem).filter(MenuItem.tenant_id == tenant_id, MenuItem.outlet_id == outlet_id).all()

@app.post("/api/v1/sales/menu-items")
def create_menu_item(payload: MenuItemCreate, db: Session = Depends(get_db)):
    db_item = MenuItem(
        tenant_id=payload.tenant_id,
        outlet_id=payload.outlet_id,
        sku=payload.sku,
        name=payload.name,
        price=payload.price,
        cost=payload.cost
    )
    try:
        db.add(db_item)
        db.commit()
        db.refresh(db_item)
        return db_item
    except Exception:
        db.rollback()
        raise HTTPException(status_code=400, detail="Menu Item with this SKU already exists")

@app.put("/api/v1/sales/menu-items/{item_id}")
def update_menu_item(item_id: str, payload: MenuItemUpdate, db: Session = Depends(get_db)):
    item = db.query(MenuItem).filter(MenuItem.id == uuid.UUID(item_id)).first()
    if not item:
        raise HTTPException(status_code=404, detail="Menu item not found")
    
    if payload.name is not None: item.name = payload.name
    if payload.price is not None: item.price = payload.price
    if payload.cost is not None: item.cost = payload.cost
    
    db.commit()
    db.refresh(item)
    return item

# --- FEATURE 1: BILLING SYSTEM INTEGRATION ---
@app.post("/api/v1/sales/bill")
def record_customer_bill(payload: CustomerBillCreate, db: Session = Depends(get_db)):
    # Resolves menu items by SKU
    menu_map = {m.sku: m for m in db.query(MenuItem).filter(
        MenuItem.tenant_id == payload.tenant_id,
        MenuItem.outlet_id == payload.outlet_id
    ).all()}
    
    now = datetime.utcnow()
    meal_period = classify_meal_period(now)
    total_bill_amount = 0.0
    synced_records = []
    
    for item in payload.items:
        if item.sku not in menu_map:
            continue
        db_item = menu_map[item.sku]
        price = item.unit_price if item.unit_price is not None else float(db_item.price)
        total = price * item.quantity
        total_bill_amount += total
        
        tx = SalesTransaction(
            tenant_id=payload.tenant_id,
            outlet_id=payload.outlet_id,
            transaction_id=payload.transaction_id,
            menu_item_id=db_item.id,
            quantity=item.quantity,
            unit_price=price,
            total_amount=total,
            meal_period=meal_period,
            payment_method=payload.payment_method,
            table_area=payload.table_area,
            customer_count=payload.customer_count or 1,
            is_reservation=payload.is_reservation or False,
            transaction_time=now
        )
        db.add(tx)
        synced_records.append(tx)
        
    db.commit()
    update_daily_snapshot(db, payload.tenant_id, payload.outlet_id, now.date(), total_bill_amount)
    
    return {
        "status": "SUCCESS",
        "invoice_number": payload.transaction_id,
        "items_billed": len(synced_records),
        "total_amount": total_bill_amount,
        "payment_method": payload.payment_method,
        "table_area": payload.table_area,
        "meal_period": meal_period
    }

# --- LIST RECENT CUSTOMER INVOICES ---
@app.get("/api/v1/sales/invoices")
def list_recent_invoices(tenant_id: str, outlet_id: str, limit: int = 15, db: Session = Depends(get_db)):
    txs = db.query(SalesTransaction, MenuItem).join(
        MenuItem, SalesTransaction.menu_item_id == MenuItem.id
    ).filter(
        SalesTransaction.tenant_id == tenant_id,
        SalesTransaction.outlet_id == outlet_id
    ).order_by(desc(SalesTransaction.transaction_time)).limit(limit * 3).all()
    
    grouped = {}
    for tx, item in txs:
        inv_id = tx.transaction_id
        if inv_id not in grouped:
            grouped[inv_id] = {
                "invoice_number": inv_id,
                "transaction_time": tx.transaction_time.isoformat(),
                "meal_period": tx.meal_period or "General",
                "payment_method": tx.payment_method or "UPI",
                "table_area": tx.table_area or "Indoor",
                "customer_count": tx.customer_count or 1,
                "total_amount": 0.0,
                "items": []
            }
        
        item_total = float(tx.total_amount)
        grouped[inv_id]["total_amount"] += item_total
        grouped[inv_id]["items"].append({
            "item_name": item.name,
            "quantity": tx.quantity,
            "unit_price": float(tx.unit_price),
            "total_amount": item_total
        })
        
    return list(grouped.values())[:limit]

# --- POS WEBHOOK (JSON) ---
@app.post("/api/v1/sales/pos-sync/json")
def pos_sync_json(payload: POSSyncJSONPayload, db: Session = Depends(get_db)):
    try:
        synced_count = 0
        total_rev = 0.0
        
        menu_items_map = {m.sku: m for m in db.query(MenuItem).filter(
            MenuItem.tenant_id == payload.tenant_id,
            MenuItem.outlet_id == payload.outlet_id
        ).all()}
        
        for tx in payload.transactions:
            meal_period = classify_meal_period(tx.transaction_time)
            for item in tx.items:
                if item.sku not in menu_items_map:
                    continue
                db_item = menu_items_map[item.sku]
                
                sales_tx = SalesTransaction(
                    tenant_id=payload.tenant_id,
                    outlet_id=payload.outlet_id,
                    transaction_id=tx.transaction_id,
                    menu_item_id=db_item.id,
                    quantity=item.quantity,
                    unit_price=item.unit_price,
                    total_amount=item.quantity * item.unit_price,
                    meal_period=meal_period,
                    payment_method=tx.payment_method or "UPI",
                    table_area=tx.table_area or "Indoor",
                    customer_count=tx.customer_count or 1,
                    is_reservation=tx.is_reservation or False,
                    transaction_time=tx.transaction_time
                )
                db.add(sales_tx)
                synced_count += 1
                total_rev += sales_tx.total_amount
                update_daily_snapshot(db, payload.tenant_id, payload.outlet_id, tx.transaction_time.date(), sales_tx.total_amount)
                
        sync_log = POSSyncLog(
            tenant_id=payload.tenant_id,
            outlet_id=payload.outlet_id,
            sync_status="Success",
            records_synced=synced_count
        )
        db.add(sync_log)
        db.commit()
        
        return {"status": "SUCCESS", "records_synced": synced_count, "revenue_ingested": total_rev}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Sync failed: {str(e)}")

# --- POS CSV SYNC ---
@app.post("/api/v1/sales/pos-sync/csv")
def pos_sync_csv(payload: POSSyncCSVPayload, db: Session = Depends(get_db)):
    try:
        reader = csv.DictReader(payload.csv_data.strip().splitlines())
        synced_count = 0
        total_rev = 0.0
        
        menu_items_map = {m.sku: m for m in db.query(MenuItem).filter(
            MenuItem.tenant_id == payload.tenant_id,
            MenuItem.outlet_id == payload.outlet_id
        ).all()}
        
        for row in reader:
            sku = row["sku"]
            if sku not in menu_items_map:
                continue
            db_item = menu_items_map[sku]
            
            tx_time = datetime.fromisoformat(row["transaction_time"].replace("Z", "+00:00"))
            meal_period = classify_meal_period(tx_time)
            qty = int(row["quantity"])
            price = float(row["unit_price"])
            total = qty * price
            
            tx = SalesTransaction(
                tenant_id=payload.tenant_id,
                outlet_id=payload.outlet_id,
                transaction_id=row["transaction_id"],
                menu_item_id=db_item.id,
                quantity=qty,
                unit_price=price,
                total_amount=total,
                meal_period=meal_period,
                payment_method=row.get("payment_method", "UPI"),
                table_area=row.get("table_area", "Indoor"),
                transaction_time=tx_time
            )
            db.add(tx)
            synced_count += 1
            total_rev += total
            update_daily_snapshot(db, payload.tenant_id, payload.outlet_id, tx_time.date(), total)
            
        db.commit()
        return {"status": "SUCCESS", "records_synced": synced_count, "revenue_ingested": total_rev}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"CSV import failed: {str(e)}")

# --- COMPREHENSIVE DASHBOARD ANALYTICS (FEATURES 2, 3, 4, 5, 6, 7, 8) ---
@app.get("/api/v1/sales/dashboard-analytics")
def get_dashboard_analytics(
    tenant_id: str,
    outlet_id: str,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    db: Session = Depends(get_db)
):
    if not end_date:
        end_date = datetime.utcnow()
    if not start_date:
        start_date = end_date - timedelta(days=30)
        
    sentinel = check_sync_sentinel_alert(db, tenant_id, outlet_id)
    
    # 1. Total Revenue & Order Volume
    total_stats = db.query(
        func.coalesce(func.sum(SalesTransaction.total_amount), 0).label("revenue"),
        func.coalesce(func.sum(SalesTransaction.quantity), 0).label("items_sold"),
        func.count(func.distinct(SalesTransaction.transaction_id)).label("total_bills")
    ).filter(
        SalesTransaction.tenant_id == tenant_id,
        SalesTransaction.outlet_id == outlet_id,
        SalesTransaction.transaction_time >= start_date,
        SalesTransaction.transaction_time <= end_date
    ).first()
    
    total_revenue = float(total_stats.revenue) if total_stats else 0.0
    total_items_sold = int(total_stats.items_sold) if total_stats else 0
    total_bills = int(total_stats.total_bills) if total_stats else 0
    avg_bill_value = (total_revenue / total_bills) if total_bills > 0 else 0.0

    # 2. Revenue Tracking by Dish & Contribution Margins
    dish_query = db.query(
        MenuItem.sku,
        MenuItem.name,
        MenuItem.price,
        MenuItem.cost,
        func.coalesce(func.sum(SalesTransaction.quantity), 0).label("sold"),
        func.coalesce(func.sum(SalesTransaction.total_amount), 0).label("rev")
    ).join(MenuItem, SalesTransaction.menu_item_id == MenuItem.id).filter(
        SalesTransaction.tenant_id == tenant_id,
        SalesTransaction.outlet_id == outlet_id,
        SalesTransaction.transaction_time >= start_date,
        SalesTransaction.transaction_time <= end_date
    ).group_by(MenuItem.sku, MenuItem.name, MenuItem.price, MenuItem.cost).order_by(desc("rev")).all()
    
    dishes_analysis = []
    for sku, name, price, cost, sold, rev in dish_query:
        selling_price = float(price)
        ingredient_cost = float(cost)
        unit_margin = selling_price - ingredient_cost
        total_margin = unit_margin * int(sold)
        margin_pct = (unit_margin / selling_price * 100) if selling_price > 0 else 0.0
        
        dishes_analysis.append({
            "sku": sku,
            "name": name,
            "selling_price": selling_price,
            "ingredient_cost": ingredient_cost,
            "unit_contribution_margin": unit_margin,
            "total_contribution_margin": total_margin,
            "margin_percentage": margin_pct,
            "quantity_sold": int(sold),
            "total_revenue": float(rev)
        })
        
    # Top & Low Performers
    top_performers = sorted(dishes_analysis, key=lambda x: x["quantity_sold"], reverse=True)[:5]
    low_performers = sorted(dishes_analysis, key=lambda x: x["quantity_sold"])[:5]
    
    # 3. Meal Period Analysis (Breakfast, Lunch, Snacks, Dinner)
    meal_query = db.query(
        SalesTransaction.meal_period,
        func.coalesce(func.sum(SalesTransaction.total_amount), 0).label("rev"),
        func.count(func.distinct(SalesTransaction.transaction_id)).label("bills")
    ).filter(
        SalesTransaction.tenant_id == tenant_id,
        SalesTransaction.outlet_id == outlet_id,
        SalesTransaction.transaction_time >= start_date,
        SalesTransaction.transaction_time <= end_date
    ).group_by(SalesTransaction.meal_period).all()
    
    meal_periods = {}
    for period, rev, bills in meal_query:
        period_name = period or "General"
        r = float(rev)
        b = int(bills)
        meal_periods[period_name] = {
            "revenue": r,
            "bills_count": b,
            "avg_bill_value": (r / b) if b > 0 else 0.0
        }
        
    # 4. Table Area Performance Analysis (Indoor, Outdoor, Family Hall, Rooftop, Bar)
    area_query = db.query(
        SalesTransaction.table_area,
        func.coalesce(func.sum(SalesTransaction.total_amount), 0).label("rev"),
        func.count(func.distinct(SalesTransaction.transaction_id)).label("bills"),
        func.coalesce(func.sum(SalesTransaction.customer_count), 0).label("customers"),
        func.sum(func.cast(SalesTransaction.is_reservation, Integer)).label("reservations")
    ).filter(
        SalesTransaction.tenant_id == tenant_id,
        SalesTransaction.outlet_id == outlet_id,
        SalesTransaction.transaction_time >= start_date,
        SalesTransaction.transaction_time <= end_date
    ).group_by(SalesTransaction.table_area).all()
    
    table_areas = []
    for area, rev, bills, cust, res_count in area_query:
        r = float(rev)
        b = int(bills)
        customers = int(cust)
        res_bills = int(res_count or 0)
        table_areas.append({
            "table_area": area or "Indoor",
            "revenue": r,
            "total_orders": b,
            "customers_served": customers,
            "avg_bill_value": (r / b) if b > 0 else 0.0,
            "occupancy_rate_pct": min(100.0, (b * 20.0)), # Simulated responsive occupancy
            "avg_dining_time_mins": 45,
            "reservation_ratio_pct": (res_bills / b * 100) if b > 0 else 0.0
        })

    # 5. Sales Trend Analysis (DoD, WoW, MoM comparisons & Peak/Lowest day)
    snapshots = db.query(SalesTrendSnapshot).filter(
        SalesTrendSnapshot.tenant_id == tenant_id,
        SalesTrendSnapshot.outlet_id == outlet_id,
        SalesTrendSnapshot.snapshot_date >= start_date.date(),
        SalesTrendSnapshot.snapshot_date <= end_date.date()
    ).order_by(SalesTrendSnapshot.snapshot_date).all()
    
    daily_trends = [
        {
            "date": s.snapshot_date.isoformat(),
            "revenue": float(s.total_revenue),
            "orders": s.total_orders
        } for s in snapshots
    ]
    
    peak_day = max(snapshots, key=lambda s: float(s.total_revenue)).snapshot_date.isoformat() if snapshots else "N/A"
    lowest_day = min(snapshots, key=lambda s: float(s.total_revenue)).snapshot_date.isoformat() if snapshots else "N/A"

    return {
        "tenant_id": tenant_id,
        "outlet_id": outlet_id,
        "total_revenue": total_revenue,
        "total_items_sold": total_items_sold,
        "total_bills": total_bills,
        "average_bill_value": avg_bill_value,
        "dishes_revenue_analysis": dishes_analysis,
        "top_performing_items": top_performers,
        "low_performing_items": low_performers,
        "meal_period_analysis": meal_periods,
        "daily_sales_trends": daily_trends,
        "peak_sales_day": peak_day,
        "lowest_sales_day": lowest_day,
        "sync_sentinel_alert": sentinel["sync_offline"],
        "sync_alert_packet": sentinel["alert_packet"]
    }

# --- GET /api/v1/sales/trends (DoD, WoW, MoM comparison for Dashboard Overview) ---
@app.get("/api/v1/sales/trends")
def get_sales_trends(
    tenant_id: str,
    outlet_id: str,
    target_date: Optional[date] = None,
    db: Session = Depends(get_db)
):
    if not target_date:
        target_date = date.today()

    def get_revenue_for_date(d: date) -> float:
        snap_rev = db.query(func.coalesce(func.sum(SalesTrendSnapshot.total_revenue), 0)).filter(
            SalesTrendSnapshot.tenant_id == tenant_id,
            SalesTrendSnapshot.outlet_id == outlet_id,
            SalesTrendSnapshot.snapshot_date == d
        ).scalar()
        
        tx_rev = db.query(func.coalesce(func.sum(SalesTransaction.total_amount), 0)).filter(
            SalesTransaction.tenant_id == tenant_id,
            SalesTransaction.outlet_id == outlet_id,
            func.date(SalesTransaction.transaction_time) == d
        ).scalar()
        
        return max(float(snap_rev or 0), float(tx_rev or 0))

    target_rev = get_revenue_for_date(target_date)
    if target_rev == 0.0:
        latest_tx_date = db.query(func.max(func.date(SalesTransaction.transaction_time))).filter(
            SalesTransaction.tenant_id == tenant_id,
            SalesTransaction.outlet_id == outlet_id
        ).scalar()
        if latest_tx_date:
            target_date = latest_tx_date
            target_rev = get_revenue_for_date(target_date)

    yesterday = target_date - timedelta(days=1)
    last_week = target_date - timedelta(days=7)
    last_month = target_date - timedelta(days=30)

    dod_rev = get_revenue_for_date(yesterday)
    wow_rev = get_revenue_for_date(last_week)
    mom_rev = get_revenue_for_date(last_month)

    dod_growth = ((target_rev - dod_rev) / dod_rev * 100) if dod_rev > 0 else (100.0 if target_rev > 0 else 0.0)
    wow_growth = ((target_rev - wow_rev) / wow_rev * 100) if wow_rev > 0 else (100.0 if target_rev > 0 else 0.0)
    mom_growth = ((target_rev - mom_rev) / mom_rev * 100) if mom_rev > 0 else (100.0 if target_rev > 0 else 0.0)

    return {
        "date": target_date.isoformat(),
        "revenue": target_rev,
        "comparisons": {
            "day_over_day": {
                "previous_revenue": dod_rev,
                "growth_percentage": dod_growth
            },
            "week_over_week": {
                "previous_revenue": wow_rev,
                "growth_percentage": wow_growth
            },
            "month_over_month": {
                "previous_revenue": mom_rev,
                "growth_percentage": mom_growth
            }
        }
    }


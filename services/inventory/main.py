import os
import uuid
import jwt
import httpx
from datetime import datetime, timedelta
from typing import List, Optional, Dict
from fastapi import FastAPI, Depends, HTTPException, status, Header, Query
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, String, Integer, DateTime, ForeignKey, func, and_, select, Numeric, desc
from sqlalchemy.orm import declarative_base, sessionmaker, Session, relationship
from sqlalchemy.dialects.postgresql import UUID

# Configs
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://inventory_user:inventory_secure_pass@db-inventory:5432/dineiq_inventory")
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
class Vendor(Base):
    __tablename__ = "vendors"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(String(50), nullable=False)
    outlet_id = Column(String(50), nullable=False)
    name = Column(String(100), nullable=False)
    contact_name = Column(String(100))
    email = Column(String(255))
    phone = Column(String(50))
    supplies = Column(String(255)) # e.g. 'Chicken, Eggs, Milk'
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

class Ingredient(Base):
    __tablename__ = "ingredients"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(String(50), nullable=False)
    outlet_id = Column(String(50), nullable=False)
    name = Column(String(100), nullable=False)
    unit = Column(String(20), nullable=False)
    min_threshold = Column(Numeric(12, 4), nullable=False)
    cost_per_unit = Column(Numeric(12, 4), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

class StockTransaction(Base):
    __tablename__ = "stock_transactions"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(String(50), nullable=False)
    outlet_id = Column(String(50), nullable=False)
    ingredient_id = Column(UUID(as_uuid=True), ForeignKey("ingredients.id"), nullable=False)
    type = Column(String(50), nullable=False) # 'opening', 'closing', 'purchase', 'wastage', 'consumption'
    quantity = Column(Numeric(12, 4), nullable=False)
    unit_cost = Column(Numeric(12, 4), nullable=False)
    vendor_id = Column(UUID(as_uuid=True), ForeignKey("vendors.id"), nullable=True)
    reason = Column(String(100), nullable=True) # e.g. 'Burnt', 'Rotten', 'Expired', 'Spoiled', 'Damaged'
    notes = Column(String(255), nullable=True)
    transaction_date = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    created_by = Column(UUID(as_uuid=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

class ReorderAlert(Base):
    __tablename__ = "reorder_alerts"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(String(50), nullable=False)
    outlet_id = Column(String(50), nullable=False)
    ingredient_id = Column(UUID(as_uuid=True), ForeignKey("ingredients.id"), nullable=False)
    status = Column(String(50), default="Active", nullable=False) # 'Active', 'Resolved'
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    resolved_at = Column(DateTime(timezone=True))

# FastAPI Init
app = FastAPI(title="DineIQ Inventory & Wastage Tracker API")

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
class VendorCreate(BaseModel):
    tenant_id: str
    outlet_id: str
    name: str
    contact_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    supplies: Optional[str] = None

class VendorUpdate(BaseModel):
    name: Optional[str] = None
    contact_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    supplies: Optional[str] = None

class IngredientCreate(BaseModel):
    tenant_id: str
    outlet_id: str
    name: str
    unit: str
    min_threshold: float
    cost_per_unit: float

class IngredientUpdate(BaseModel):
    name: Optional[str] = None
    unit: Optional[str] = None
    min_threshold: Optional[float] = None
    cost_per_unit: Optional[float] = None

class StockTransactionCreate(BaseModel):
    tenant_id: str
    outlet_id: str
    ingredient_id: str
    type: str # 'opening', 'closing', 'purchase', 'wastage', 'consumption'
    quantity: float
    unit_cost: float
    vendor_id: Optional[str] = None
    reason: Optional[str] = None
    notes: Optional[str] = None

class DailyReconcileCreate(BaseModel):
    tenant_id: str
    outlet_id: str
    ingredient_id: str
    opening_quantity: Optional[float] = None
    purchased_quantity: Optional[float] = 0.0
    closing_quantity: float
    unit_cost: Optional[float] = None

# Helper: Compute stock balance for an ingredient
def calculate_stock_balance(db: Session, ingredient_id: uuid.UUID) -> float:
    # Formula: Opening + Purchases - Consumption - Wastage
    pos_query = db.query(func.coalesce(func.sum(StockTransaction.quantity), 0)).filter(
        StockTransaction.ingredient_id == ingredient_id,
        StockTransaction.type.in_(["opening", "purchase"])
    ).scalar()
    
    neg_query = db.query(func.coalesce(func.sum(StockTransaction.quantity), 0)).filter(
        StockTransaction.ingredient_id == ingredient_id,
        StockTransaction.type.in_(["consumption", "wastage"])
    ).scalar()
    
    return float(pos_query - neg_query)

# Helper: Reorder Alert Engine
def check_reorder_trigger(db: Session, tenant_id: str, outlet_id: str, ingredient: Ingredient, current_balance: float):
    if current_balance < float(ingredient.min_threshold):
        active_alert = db.query(ReorderAlert).filter(
            ReorderAlert.ingredient_id == ingredient.id,
            ReorderAlert.status == "Active"
        ).first()
        
        if not active_alert:
            alert = ReorderAlert(
                tenant_id=tenant_id,
                outlet_id=outlet_id,
                ingredient_id=ingredient.id,
                status="Active"
            )
            db.add(alert)
            db.commit()
            
            alert_payload = {
                "event": "REORDER_ALERT",
                "tenant_id": tenant_id,
                "outlet_id": outlet_id,
                "ingredient_id": str(ingredient.id),
                "ingredient_name": ingredient.name,
                "current_balance": current_balance,
                "min_threshold": float(ingredient.min_threshold),
                "timestamp": datetime.utcnow().isoformat()
            }
            print(f"NOTIFICATION ENGINE PUBLISH: {alert_payload}")
            
            try:
                msg = f"[Low Stock Alert] '{ingredient.name}' is below minimum threshold ({ingredient.min_threshold} {ingredient.unit}). Current stock: {current_balance} {ingredient.unit}."
                notif_payload = {
                    "tenant_id": tenant_id,
                    "outlet_id": outlet_id,
                    "type": "Low Stock Alert",
                    "recipient": "Manager",
                    "message": msg
                }
                httpx.post("http://reservation-service:3003/api/v1/reservations/notifications", json=notif_payload, timeout=2.0)
            except Exception as e:
                print(f"Failed to post low stock alert: {e}")
                
            return alert_payload
    else:
        # Resolve active alerts if stock balance restored
        active_alert = db.query(ReorderAlert).filter(
            ReorderAlert.ingredient_id == ingredient.id,
            ReorderAlert.status == "Active"
        ).first()
        if active_alert:
            active_alert.status = "Resolved"
            active_alert.resolved_at = datetime.utcnow()
            db.commit()
    return None

# Endpoints
@app.get("/health")
def health():
    return {"status": "UP", "service": "inventory-service"}

# --- VENDORS CRUD ---
@app.post("/api/v1/inventory/vendors")
def create_vendor(payload: VendorCreate, db: Session = Depends(get_db)):
    db_vendor = Vendor(
        tenant_id=payload.tenant_id,
        outlet_id=payload.outlet_id,
        name=payload.name,
        contact_name=payload.contact_name,
        email=payload.email,
        phone=payload.phone,
        supplies=payload.supplies
    )
    try:
        db.add(db_vendor)
        db.commit()
        db.refresh(db_vendor)
        return db_vendor
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail="Vendor creation failed. Vendor name may already exist.")

@app.get("/api/v1/inventory/vendors")
def list_vendors(tenant_id: str, outlet_id: str, db: Session = Depends(get_db)):
    return db.query(Vendor).filter(Vendor.tenant_id == tenant_id, Vendor.outlet_id == outlet_id).all()

@app.put("/api/v1/inventory/vendors/{vendor_id}")
def update_vendor(vendor_id: str, payload: VendorUpdate, db: Session = Depends(get_db)):
    vendor = db.query(Vendor).filter(Vendor.id == uuid.UUID(vendor_id)).first()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    
    if payload.name is not None: vendor.name = payload.name
    if payload.contact_name is not None: vendor.contact_name = payload.contact_name
    if payload.email is not None: vendor.email = payload.email
    if payload.phone is not None: vendor.phone = payload.phone
    if payload.supplies is not None: vendor.supplies = payload.supplies
    
    db.commit()
    db.refresh(vendor)
    return vendor

# --- INGREDIENTS CRUD ---
@app.get("/api/v1/inventory/ingredients")
def list_ingredients(tenant_id: str, outlet_id: str, db: Session = Depends(get_db)):
    return db.query(Ingredient).filter(Ingredient.tenant_id == tenant_id, Ingredient.outlet_id == outlet_id).all()

@app.post("/api/v1/inventory/ingredients")
def create_ingredient(payload: IngredientCreate, db: Session = Depends(get_db)):
    db_ing = Ingredient(
        tenant_id=payload.tenant_id,
        outlet_id=payload.outlet_id,
        name=payload.name,
        unit=payload.unit,
        min_threshold=payload.min_threshold,
        cost_per_unit=payload.cost_per_unit
    )
    try:
        db.add(db_ing)
        db.commit()
        db.refresh(db_ing)
        return db_ing
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail="Ingredient already exists or invalid payload.")

@app.put("/api/v1/inventory/ingredients/{ingredient_id}")
def update_ingredient(ingredient_id: str, payload: IngredientUpdate, db: Session = Depends(get_db)):
    ing = db.query(Ingredient).filter(Ingredient.id == uuid.UUID(ingredient_id)).first()
    if not ing:
        raise HTTPException(status_code=404, detail="Ingredient not found")
    
    if payload.name is not None: ing.name = payload.name
    if payload.unit is not None: ing.unit = payload.unit
    if payload.min_threshold is not None: ing.min_threshold = payload.min_threshold
    if payload.cost_per_unit is not None: ing.cost_per_unit = payload.cost_per_unit
    
    db.commit()
    db.refresh(ing)
    return ing

# --- STOCK TRANSACTIONS ---
@app.post("/api/v1/inventory/stock-transactions")
def create_stock_transaction(
    payload: StockTransactionCreate, 
    db: Session = Depends(get_db), 
    user: dict = Depends(verify_jwt)
):
    ing_uuid = uuid.UUID(payload.ingredient_id)
    ingredient = db.query(Ingredient).filter(Ingredient.id == ing_uuid).first()
    
    if not ingredient:
        raise HTTPException(status_code=404, detail="Ingredient not found")
        
    valid_types = ["opening", "closing", "purchase", "wastage", "consumption"]
    if payload.type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Invalid transaction type. Must be one of {valid_types}")
        
    # Strict Stock Guard
    if payload.type in ["consumption", "wastage"]:
        current_balance = calculate_stock_balance(db, ing_uuid)
        future_balance = current_balance - payload.quantity
        
        if future_balance < 0:
            role = user.get("role", "Staff")
            has_override = role in ["Owner", "Manager"]
            if not has_override:
                raise HTTPException(
                    status_code=422,
                    detail={
                        "error": "NEGATIVE_STOCK_VIOLATION",
                        "message": f"Transaction reduces stock of '{ingredient.name}' to {future_balance} {ingredient.unit}. Manager override claim required."
                    }
                )
                
    user_id = user.get("sub")
    vendor_uuid = uuid.UUID(payload.vendor_id) if payload.vendor_id else None
    
    db_tx = StockTransaction(
        tenant_id=payload.tenant_id,
        outlet_id=payload.outlet_id,
        ingredient_id=ing_uuid,
        type=payload.type,
        quantity=payload.quantity,
        unit_cost=payload.unit_cost,
        vendor_id=vendor_uuid,
        reason=payload.reason,
        notes=payload.notes,
        created_by=uuid.UUID(user_id) if user_id else None
    )
    
    db.add(db_tx)
    db.commit()
    db.refresh(db_tx)
    
    new_balance = calculate_stock_balance(db, ing_uuid)
    alert_packet = check_reorder_trigger(db, payload.tenant_id, payload.outlet_id, ingredient, new_balance)
    
    return {
        "transaction": db_tx,
        "new_balance": new_balance,
        "reorder_alert_triggered": alert_packet is not None,
        "alert_packet": alert_packet
    }

# --- DAILY RECONCILIATION (Opening & Closing Stock Management + Auto Consumption) ---
@app.post("/api/v1/inventory/reconcile")
def reconcile_daily_stock(
    payload: DailyReconcileCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(verify_jwt)
):
    ing_uuid = uuid.UUID(payload.ingredient_id)
    ingredient = db.query(Ingredient).filter(Ingredient.id == ing_uuid).first()
    if not ingredient:
        raise HTTPException(status_code=404, detail="Ingredient not found")
        
    unit_cost = payload.unit_cost if payload.unit_cost is not None else float(ingredient.cost_per_unit)
    user_id = user.get("sub")
    user_uuid = uuid.UUID(user_id) if user_id else None

    # Calculate Consumption using formula: Consumption = Opening Stock + Purchased Stock - Closing Stock
    opening_qty = payload.opening_quantity
    if opening_qty is None:
        opening_qty = calculate_stock_balance(db, ing_uuid)
        
    purchased_qty = payload.purchased_quantity or 0.0
    closing_qty = payload.closing_quantity
    
    consumption_qty = opening_qty + purchased_qty - closing_qty
    if consumption_qty < 0:
        consumption_qty = 0.0 # Guard against negative calculated consumption

    # Save closing stock record
    closing_tx = StockTransaction(
        tenant_id=payload.tenant_id,
        outlet_id=payload.outlet_id,
        ingredient_id=ing_uuid,
        type="closing",
        quantity=closing_qty,
        unit_cost=unit_cost,
        notes=f"Night Closing Stock: {closing_qty} {ingredient.unit}",
        created_by=user_uuid
    )
    db.add(closing_tx)
    
    # Record calculated consumption if > 0
    consumption_tx = None
    if consumption_qty > 0:
        consumption_tx = StockTransaction(
            tenant_id=payload.tenant_id,
            outlet_id=payload.outlet_id,
            ingredient_id=ing_uuid,
            type="consumption",
            quantity=consumption_qty,
            unit_cost=unit_cost,
            notes=f"Calculated Consumption (Formula: {opening_qty} Opening + {purchased_qty} Purchased - {closing_qty} Closing)",
            created_by=user_uuid
        )
        db.add(consumption_tx)
        
    db.commit()
    
    new_balance = calculate_stock_balance(db, ing_uuid)
    alert_packet = check_reorder_trigger(db, payload.tenant_id, payload.outlet_id, ingredient, new_balance)
    
    return {
        "ingredient_id": str(ing_uuid),
        "ingredient_name": ingredient.name,
        "opening_stock": opening_qty,
        "purchased_stock": purchased_qty,
        "closing_stock": closing_qty,
        "calculated_consumption": consumption_qty,
        "unit": ingredient.unit,
        "new_balance": new_balance,
        "reorder_alert_triggered": alert_packet is not None
    }

# --- REAL-TIME STOCK LEVELS & REORDER STATUS ---
@app.get("/api/v1/inventory/levels")
def get_inventory_levels(tenant_id: str, outlet_id: str, db: Session = Depends(get_db)):
    ingredients = db.query(Ingredient).filter(
        Ingredient.tenant_id == tenant_id,
        Ingredient.outlet_id == outlet_id
    ).all()
    
    results = []
    for ing in ingredients:
        bal = calculate_stock_balance(db, ing.id)
        is_low = bal < float(ing.min_threshold)
        
        # Check active vendor if any
        vendor = db.query(Vendor).filter(
            Vendor.tenant_id == tenant_id,
            Vendor.outlet_id == outlet_id,
            Vendor.supplies.ilike(f"%{ing.name}%")
        ).first()
        
        results.append({
            "ingredient_id": str(ing.id),
            "name": ing.name,
            "unit": ing.unit,
            "min_threshold": float(ing.min_threshold),
            "cost_per_unit": float(ing.cost_per_unit),
            "current_balance": bal,
            "stock_value": bal * float(ing.cost_per_unit),
            "needs_reorder": is_low,
            "vendor": {
                "id": str(vendor.id),
                "name": vendor.name,
                "phone": vendor.phone,
                "email": vendor.email
            } if vendor else None
        })
        
    return results

# --- PURCHASES HISTORY ---
@app.get("/api/v1/inventory/purchases")
def list_purchases(tenant_id: str, outlet_id: str, db: Session = Depends(get_db)):
    purchases = db.query(StockTransaction, Ingredient, Vendor).join(
        Ingredient, StockTransaction.ingredient_id == Ingredient.id
    ).outerjoin(
        Vendor, StockTransaction.vendor_id == Vendor.id
    ).filter(
        StockTransaction.tenant_id == tenant_id,
        StockTransaction.outlet_id == outlet_id,
        StockTransaction.type == "purchase"
    ).order_by(desc(StockTransaction.transaction_date)).all()
    
    result = []
    for tx, ing, v in purchases:
        result.append({
            "id": str(tx.id),
            "transaction_date": tx.transaction_date.isoformat(),
            "ingredient_name": ing.name,
            "quantity": float(tx.quantity),
            "unit": ing.unit,
            "unit_cost": float(tx.unit_cost),
            "total_cost": float(tx.quantity * tx.unit_cost),
            "vendor_name": v.name if v else "Direct Supplier",
            "vendor_phone": v.phone if v else None,
            "notes": tx.notes
        })
    return result

# --- WASTAGE REPORT ---
@app.get("/api/v1/inventory/wastage-report")
def get_wastage_report(
    tenant_id: str,
    outlet_id: str,
    db: Session = Depends(get_db)
):
    wastage_items = db.query(StockTransaction, Ingredient).join(
        Ingredient, StockTransaction.ingredient_id == Ingredient.id
    ).filter(
        StockTransaction.tenant_id == tenant_id,
        StockTransaction.outlet_id == outlet_id,
        StockTransaction.type == "wastage"
    ).order_by(desc(StockTransaction.transaction_date)).all()
    
    details = []
    reason_breakdown: Dict[str, Dict[str, float]] = {}
    total_cost = 0.0
    total_qty = 0.0
    
    for tx, ing in wastage_items:
        cost = float(tx.quantity * tx.unit_cost)
        qty = float(tx.quantity)
        reason = tx.reason or "Unspecified"
        
        total_cost += cost
        total_qty += qty
        
        if reason not in reason_breakdown:
            reason_breakdown[reason] = {"qty": 0.0, "cost": 0.0}
        reason_breakdown[reason]["qty"] += qty
        reason_breakdown[reason]["cost"] += cost
        
        details.append({
            "id": str(tx.id),
            "ingredient_name": ing.name,
            "quantity": qty,
            "unit": ing.unit,
            "unit_cost": float(tx.unit_cost),
            "total_cost": cost,
            "reason": reason,
            "notes": tx.notes,
            "date": tx.transaction_date.isoformat()
        })
        
    reasons_summary = [
        {"reason": r, "quantity": data["qty"], "cost": data["cost"]}
        for r, data in reason_breakdown.items()
    ]
    
    return {
        "total_wastage_cost": total_cost,
        "total_wastage_qty": total_qty,
        "reason_summary": reasons_summary,
        "details": details
    }

# --- REORDER ALERTS ---
@app.get("/api/v1/inventory/reorder-alerts")
def list_reorder_alerts(tenant_id: str, outlet_id: str, db: Session = Depends(get_db)):
    alerts = db.query(ReorderAlert, Ingredient).join(
        Ingredient, ReorderAlert.ingredient_id == Ingredient.id
    ).filter(
        ReorderAlert.tenant_id == tenant_id,
        ReorderAlert.outlet_id == outlet_id,
        ReorderAlert.status == "Active"
    ).all()
    
    results = []
    for alert, ing in alerts:
        bal = calculate_stock_balance(db, ing.id)
        vendor = db.query(Vendor).filter(
            Vendor.tenant_id == tenant_id,
            Vendor.outlet_id == outlet_id,
            Vendor.supplies.ilike(f"%{ing.name}%")
        ).first()
        
        results.append({
            "alert_id": str(alert.id),
            "ingredient_id": str(ing.id),
            "ingredient_name": ing.name,
            "current_balance": bal,
            "min_threshold": float(ing.min_threshold),
            "unit": ing.unit,
            "created_at": alert.created_at.isoformat(),
            "vendor_name": vendor.name if vendor else "N/A",
            "vendor_phone": vendor.phone if vendor else "N/A"
        })
    return results

@app.put("/api/v1/inventory/reorder-alerts/{alert_id}/resolve")
def resolve_reorder_alert(alert_id: str, db: Session = Depends(get_db)):
    alert = db.query(ReorderAlert).filter(ReorderAlert.id == uuid.UUID(alert_id)).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.status = "Resolved"
    alert.resolved_at = datetime.utcnow()
    db.commit()
    return {"status": "SUCCESS", "message": "Alert resolved"}

# --- COMPREHENSIVE ANALYTICS DASHBOARD ---
@app.get("/api/v1/inventory/analytics")
def get_inventory_analytics(
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
        
    # 1. Total Inventory Value (Current Stock * cost_per_unit)
    ingredients = db.query(Ingredient).filter(
        Ingredient.tenant_id == tenant_id,
        Ingredient.outlet_id == outlet_id
    ).all()
    
    total_inventory_value = 0.0
    low_stock_count = 0
    for ing in ingredients:
        bal = calculate_stock_balance(db, ing.id)
        total_inventory_value += bal * float(ing.cost_per_unit)
        if bal < float(ing.min_threshold):
            low_stock_count += 1
            
    # 2. Consumption & Food Cost (COGS)
    consumption_data = db.query(
        func.coalesce(func.sum(StockTransaction.quantity), 0).label("qty"),
        func.coalesce(func.sum(StockTransaction.quantity * StockTransaction.unit_cost), 0).label("cost")
    ).filter(
        StockTransaction.tenant_id == tenant_id,
        StockTransaction.outlet_id == outlet_id,
        StockTransaction.type == "consumption",
        StockTransaction.transaction_date >= start_date,
        StockTransaction.transaction_date <= end_date
    ).first()
    
    # 3. Wastage Cost & Quantity
    wastage_data = db.query(
        func.coalesce(func.sum(StockTransaction.quantity), 0).label("qty"),
        func.coalesce(func.sum(StockTransaction.quantity * StockTransaction.unit_cost), 0).label("cost")
    ).filter(
        StockTransaction.tenant_id == tenant_id,
        StockTransaction.outlet_id == outlet_id,
        StockTransaction.type == "wastage",
        StockTransaction.transaction_date >= start_date,
        StockTransaction.transaction_date <= end_date
    ).first()

    # 4. Monthly Purchase Cost
    purchase_data = db.query(
        func.coalesce(func.sum(StockTransaction.quantity * StockTransaction.unit_cost), 0).label("cost")
    ).filter(
        StockTransaction.tenant_id == tenant_id,
        StockTransaction.outlet_id == outlet_id,
        StockTransaction.type == "purchase",
        StockTransaction.transaction_date >= start_date,
        StockTransaction.transaction_date <= end_date
    ).first()

    total_consumption = float(consumption_data.qty) if consumption_data else 0.0
    total_wastage = float(wastage_data.qty) if wastage_data else 0.0
    food_cost = float(consumption_data.cost) if consumption_data else 0.0
    wastage_cost = float(wastage_data.cost) if wastage_data else 0.0
    monthly_purchase_cost = float(purchase_data.cost) if purchase_data else 0.0
    
    total_usage = total_consumption + total_wastage
    wastage_percentage = (total_wastage / total_usage * 100) if total_usage > 0 else 0.0
    
    # 5. Top Consumed Ingredients
    top_consumed = db.query(
        Ingredient.name,
        Ingredient.unit,
        func.coalesce(func.sum(StockTransaction.quantity), 0).label("total_qty"),
        func.coalesce(func.sum(StockTransaction.quantity * StockTransaction.unit_cost), 0).label("total_cost")
    ).join(Ingredient, StockTransaction.ingredient_id == Ingredient.id).filter(
        StockTransaction.tenant_id == tenant_id,
        StockTransaction.outlet_id == outlet_id,
        StockTransaction.type == "consumption",
        StockTransaction.transaction_date >= start_date,
        StockTransaction.transaction_date <= end_date
    ).group_by(Ingredient.name, Ingredient.unit).order_by(desc("total_cost")).limit(5).all()
    
    trends = [
        {
            "ingredient_name": name,
            "unit": unit,
            "quantity": float(qty),
            "cost": float(cost)
        } for name, unit, qty, cost in top_consumed
    ]
    
    # 6. Wastage Analysis by Reason
    wastage_reasons = db.query(
        StockTransaction.reason,
        func.coalesce(func.sum(StockTransaction.quantity), 0).label("total_qty"),
        func.coalesce(func.sum(StockTransaction.quantity * StockTransaction.unit_cost), 0).label("total_cost")
    ).filter(
        StockTransaction.tenant_id == tenant_id,
        StockTransaction.outlet_id == outlet_id,
        StockTransaction.type == "wastage",
        StockTransaction.transaction_date >= start_date,
        StockTransaction.transaction_date <= end_date
    ).group_by(StockTransaction.reason).all()
    
    reasons_list = [
        {
            "reason": reason or "Unspecified",
            "quantity": float(qty),
            "cost": float(cost)
        } for reason, qty, cost in wastage_reasons
    ]

    return {
        "tenant_id": tenant_id,
        "outlet_id": outlet_id,
        "inventory_value": total_inventory_value,
        "food_cost_cogs": food_cost,
        "wastage_cost": wastage_cost,
        "monthly_purchase_cost": monthly_purchase_cost,
        "total_consumption_qty": total_consumption,
        "total_wastage_qty": total_wastage,
        "wastage_percentage": wastage_percentage,
        "low_stock_count": low_stock_count,
        "top_consumed_ingredients": trends,
        "wastage_by_reason": reasons_list
    }

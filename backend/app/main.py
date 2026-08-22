"""
FastAPI entrypoint for Money is Always Right.
Phase 1: user profiles via Firebase
Phase 2: transaction pipeline + FSS deposit/savings products
Phase 3: personalized dashboard & financial roadmap
Phase 4: digital twin simulation
Phase 5: AI financial coach (AWS Bedrock)
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes import coach, dashboard, health, products, simulation, transactions, users

app = FastAPI(
    title="Money is Always Right API",
    description="AI-driven financial coaching platform backend",
    version="0.5.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(transactions.router, prefix="/api/transactions", tags=["transactions"])
app.include_router(products.router, prefix="/api/products", tags=["products"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["dashboard"])
app.include_router(simulation.router, prefix="/api/simulation", tags=["simulation"])
app.include_router(coach.router, prefix="/api/coach", tags=["coach"])

"""
Atherum OASIS Worker — Python FastAPI Server

This is the Python subprocess that runs CAMEL-AI's OASIS framework for
social media simulation. It exposes an HTTP API that the TypeScript
oasis-bridge package calls.

Architecture:
- FastAPI for HTTP
- Background tasks for simulation execution
- SSE streaming for progress updates
- Pydantic models that mirror the TypeScript types in @atherum/core

The worker is stateless between requests — all state is passed in the
request body or stored in Redis (shared with the TS API).
"""

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum
import asyncio
import json
import uuid

app = FastAPI(title="Atherum OASIS Worker", version="0.1.0")


# ---------------------------------------------------------------------------
# Pydantic models (mirror of TypeScript types)
# ---------------------------------------------------------------------------

class SimulationPlatform(str, Enum):
    TWITTER = "twitter"
    REDDIT = "reddit"


class RecsAlgorithm(str, Enum):
    CHRONOLOGICAL = "chronological"
    ENGAGEMENT_WEIGHTED = "engagement-weighted"
    CONTROVERSY_BOOSTED = "controversy-boosted"


class PlatformConfig(BaseModel):
    platform: SimulationPlatform
    agent_count: int = Field(ge=10, le=10000)
    duration_hours: int = Field(ge=1, le=168)  # max 1 week
    time_compression: float = Field(ge=1.0, le=3600.0)
    recs_algorithm: RecsAlgorithm = RecsAlgorithm.ENGAGEMENT_WEIGHTED


class ContentItem(BaseModel):
    type: str  # "post" | "ad" | "thread"
    text: str
    media_urls: list[str] = []
    author_persona_id: Optional[str] = None
    inject_at_hour: int = 0


class SimulationSeed(BaseModel):
    content: list[ContentItem]
    variants: Optional[list[dict]] = None


class AgentProfile(BaseModel):
    """Persona converted to OASIS-compatible agent profile."""
    persona_id: str
    name: str
    archetype: str
    personality_prompt: str
    behavior_traits: dict = {}


class SimulationRequest(BaseModel):
    simulation_id: str
    workspace_id: str
    platform: PlatformConfig
    seed: SimulationSeed
    personas: list[AgentProfile] = []
    background_agent_count: int = 100
    cost_budget_usd: float = 10.0
    callback_url: Optional[str] = None


class SimulationStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    STOPPED = "stopped"


# ---------------------------------------------------------------------------
# In-memory simulation state (would use Redis in production)
# ---------------------------------------------------------------------------

simulations: dict[str, dict] = {}


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    return {"status": "ok", "engine": "oasis", "version": "0.1.0"}


@app.post("/api/v1/simulations")
async def start_simulation(
    request: SimulationRequest,
    background_tasks: BackgroundTasks,
):
    """
    Start a new social media simulation.

    The simulation runs as a background task. Progress is streamed via SSE
    on the /stream endpoint.
    """
    sim_id = request.simulation_id

    if sim_id in simulations:
        raise HTTPException(400, f"Simulation {sim_id} already exists")

    simulations[sim_id] = {
        "status": SimulationStatus.QUEUED,
        "request": request.model_dump(),
        "progress_events": [],
        "result": None,
        "stop_requested": False,
    }

    # Run simulation in background
    background_tasks.add_task(run_simulation, sim_id, request)

    return {
        "simulation_id": sim_id,
        "accepted": True,
        "status": SimulationStatus.QUEUED,
    }


@app.get("/api/v1/simulations/{sim_id}/stream")
async def stream_progress(sim_id: str):
    """
    SSE stream of simulation progress events.
    """
    if sim_id not in simulations:
        raise HTTPException(404, f"Simulation {sim_id} not found")

    async def event_generator():
        last_seen = 0
        while True:
            sim = simulations.get(sim_id)
            if sim is None:
                break

            events = sim["progress_events"][last_seen:]
            for event in events:
                yield f"data: {json.dumps(event)}\n\n"
                last_seen += 1

            if sim["status"] in (
                SimulationStatus.COMPLETED,
                SimulationStatus.FAILED,
                SimulationStatus.STOPPED,
            ):
                yield f"data: {json.dumps({'type': 'done', 'status': sim['status']})}\n\n"
                break

            await asyncio.sleep(0.5)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


@app.get("/api/v1/simulations/{sim_id}/result")
async def get_result(sim_id: str):
    """Get final simulation result."""
    sim = simulations.get(sim_id)
    if sim is None:
        raise HTTPException(404, f"Simulation {sim_id} not found")
    if sim["status"] != SimulationStatus.COMPLETED:
        raise HTTPException(409, f"Simulation not complete, status: {sim['status']}")
    return sim["result"]


@app.post("/api/v1/simulations/{sim_id}/stop")
async def stop_simulation(sim_id: str):
    """Request simulation stop. Current step completes, then results are compiled."""
    sim = simulations.get(sim_id)
    if sim is None:
        raise HTTPException(404, f"Simulation {sim_id} not found")
    sim["stop_requested"] = True
    return {"status": "stop-requested"}


# ---------------------------------------------------------------------------
# Simulation runner — this is where OASIS integration goes
# ---------------------------------------------------------------------------

async def run_simulation(sim_id: str, request: SimulationRequest):
    """
    Execute the OASIS simulation.

    This is the integration point with camel-ai/oasis. The actual
    implementation would:

    1. Convert Atherum personas to OASIS agent profiles
    2. Configure the OASIS environment (Twitter or Reddit)
    3. Set up the recommendation algorithm
    4. Inject seed content at specified times
    5. Run the simulation loop, emitting progress events
    6. Collect results and compute network analysis

    For now, this is a skeleton that shows the interface.
    """
    sim = simulations[sim_id]
    sim["status"] = SimulationStatus.RUNNING

    try:
        total_hours = request.platform.duration_hours

        for hour in range(total_hours):
            # Check for stop request
            if sim["stop_requested"]:
                sim["status"] = SimulationStatus.STOPPED
                break

            # === OASIS integration point ===
            # In production:
            #   oasis_env = create_oasis_environment(request.platform)
            #   oasis_env.step(hour)
            #   metrics = oasis_env.get_metrics()
            #   events = oasis_env.detect_events()

            # Emit progress event
            progress_event = {
                "simulation_id": sim_id,
                "virtual_hour": hour + 1,
                "total_hours": total_hours,
                "metrics": {
                    "total_posts": 0,  # from OASIS
                    "total_engagements": 0,
                    "active_agents": request.platform.agent_count,
                },
                "events": [],
            }
            sim["progress_events"].append(progress_event)

            # Simulate time compression
            await asyncio.sleep(1.0 / request.platform.time_compression)

        # Compile results
        sim["result"] = {
            "simulation_id": sim_id,
            "status": "completed",
            "propagation": [],
            "network": {"clusters": [], "propagation_paths": []},
            "timeline": [],
            "cost_usd": 0.0,
            "completed_at": None,
        }
        if sim["status"] != SimulationStatus.STOPPED:
            sim["status"] = SimulationStatus.COMPLETED

    except Exception as e:
        sim["status"] = SimulationStatus.FAILED
        sim["progress_events"].append({
            "type": "error",
            "message": str(e),
        })

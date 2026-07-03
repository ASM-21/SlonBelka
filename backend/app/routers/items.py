"""Item browser endpoints: browse/search the vocabulary and view item detail."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User
from app.routers.auth import current_user
from app.schemas import ItemBrowseResponse, ItemDetail, SynonymRequest, SynonymsResponse
from app.services import items
from app.services import synonyms as synonyms_service

router = APIRouter(prefix="/items", tags=["items"])


@router.get("", response_model=ItemBrowseResponse)
def browse_items(
    search: str | None = Query(default=None, description="Substring match on lemma or translation"),
    level: int | None = Query(default=None, ge=1),
    pos: str | None = Query(default=None, description="Part of speech filter"),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    return items.browse(db, user, search=search, level=level, pos=pos, limit=limit, offset=offset)


@router.get("/{item_id}", response_model=ItemDetail)
def item_detail(
    item_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    out = items.detail(db, user, item_id)
    if out is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Item not found")
    return out


@router.post("/{item_id}/synonyms", response_model=SynonymsResponse)
def add_synonym(
    item_id: int,
    body: SynonymRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    return {"synonyms": synonyms_service.add_synonym(db, user.id, item_id, body.text)}


@router.delete("/{item_id}/synonyms", response_model=SynonymsResponse)
def remove_synonym(
    item_id: int,
    text: str = Query(..., min_length=1),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    return {"synonyms": synonyms_service.remove_synonym(db, user.id, item_id, text)}

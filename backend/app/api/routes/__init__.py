"""API Mini App. Кожен розділ — свій файл; тут вони збираються в один роутер.

Раніше все жило в одному routes.py на 1500 рядків. За планом додадуться
Медіа, Люди, Зустрічі й Таймер, тож межі краще провести зараз, поки вони
збігаються з доменами.
"""

from fastapi import APIRouter

from . import core, dicts, ingest, money, notes, people, risks, roles, tasks, team

router = APIRouter(prefix="/api")

for _part in (core, dicts, roles, notes, tasks, risks, money, team, people, ingest):
    router.include_router(_part.router)

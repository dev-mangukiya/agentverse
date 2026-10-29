"""Validate every routing directive against a bounded plan schema."""

import re
from pydantic import BaseModel, Field, model_validator


class Step(BaseModel):
    agent: str = Field(pattern=r"^[a-z][a-z0-9_]{0,49}$")
    task: str = Field(min_length=1, max_length=24000)


class Plan(BaseModel):
    steps: list[Step] = Field(min_length=1, max_length=3)

    @model_validator(mode="after")
    def unique(self):
        if any(step.agent == "orchestrator" for step in self.steps):
            raise ValueError("The orchestrator cannot delegate to itself")
        if len({step.agent for step in self.steps}) != len(self.steps):
            raise ValueError("Duplicate agents in plan")
        return self


def parse_plan(text):
    match = re.fullmatch(
        r"\s*(DELEGATE|PARALLEL):\s*([\w\s,]+)\s*\|\s*(.+)", text, re.I | re.S
    )
    if not match:
        if text.lstrip().upper().startswith(("DELEGATE:", "PARALLEL:")):
            raise ValueError("Invalid routing plan")
        return None
    names = [name.strip().lower() for name in match[2].split(",")]
    tasks = [task.strip() for task in match[3].split("|||")]
    if len(names) != len(tasks) or (match[1].upper() == "DELEGATE" and len(names) != 1):
        raise ValueError("Each specialist must have exactly one task")
    return Plan(steps=[Step(agent=name, task=task) for name, task in zip(names, tasks)])

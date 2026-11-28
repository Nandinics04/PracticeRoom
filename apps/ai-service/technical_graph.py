import json
import os
import re
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Literal, TypedDict

from pydantic import BaseModel, Field

BROWSER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"

DIFFICULTY_MATRIX = {
    ("entry", "easy"): "Junior / Easy: Focus on syntax, core data structures, basic API design, and clear walkthroughs of resume projects.",
    ("entry", "medium"): "Junior / Medium: Focus on core mechanisms, data flow in resume projects, and basic edge cases.",
    ("entry", "hard"): "Junior / Hard: Focus on core mechanisms, concrete input/output tracing, and one breaking edge case.",
    ("mid", "easy"): "Mid / Easy: Focus on clear system walkthroughs, practical API choices, and basic tradeoffs.",
    ("mid", "medium"): "Mid / Medium: Focus on trade-offs, edge cases, failure handling, and debugging bottlenecks.",
    ("mid", "hard"): "Mid / Hard: Focus on trade-offs under load, concurrency/caching edge cases, and failure recovery.",
    ("senior", "easy"): "Senior / Easy: Focus on architectural ownership, practical tradeoffs, and verification.",
    ("senior", "medium"): "Senior / Medium: Focus on ambiguity, scale constraints, failure modes, and operational tradeoffs.",
    ("senior", "hard"): "Senior / Hard: Focus on ambiguity, scale constraints, cross-team alignment, and cascading system failure modes.",
}

FORBIDDEN_TECHNICAL_PHRASES = (
    "tell me about a time",
    "disagreed with",
    "team look like",
    "looking back",
    "project you owned",
    "what would you do differently",
    "personally own in that situation",
)


class TechnicalHook(BaseModel):
    section: Literal["Background", "Core concepts", "Follow-ups"]
    topic: str = Field(min_length=3, max_length=120)
    source: Literal["resume", "jd", "skills"]
    claim_to_probe: str = Field(min_length=5, max_length=200)


class PlannedSectionQuestion(BaseModel):
    sectionName: str
    prompt: str = Field(min_length=15)
    followUpPrompt: str = Field(min_length=10)


class TechnicalBlueprint(BaseModel):
    hooks: list[TechnicalHook] = Field(min_length=2, max_length=4)
    questions: list[PlannedSectionQuestion] = Field(min_length=3, max_length=3)


class ShadowEvaluation(BaseModel):
    score: int = Field(ge=1, le=5)
    signal_detected: str = Field(min_length=3, max_length=80)
    next_action: Literal[
        "PROBE_DEEPER",
        "PIVOT_HARDER",
        "GIVE_HINT",
        "MOVE_NEXT_TOPIC",
        "ANSWER_CANDIDATE_QUESTION",
    ]
    target_claim: str = Field(max_length=220)
    rubric_note: str = Field(min_length=5, max_length=220)
    topic_summary: str = Field(min_length=5, max_length=220)


class ConductorOutput(BaseModel):
    spoken_line: str = Field(min_length=10, max_length=360)
    hint: str = Field(default="", max_length=200)
    internal_note: str = Field(default="", max_length=120)


class TechnicalTurnState(TypedDict, total=False):
    payload: dict[str, Any]
    evaluation: dict[str, Any]
    conductor: dict[str, Any]
    outcome: str
    clarifying: bool


def load_local_env() -> None:
    path = Path(__file__).with_name(".env")
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"'))


def difficulty_guidance(level: str, difficulty: str) -> str:
    return DIFFICULTY_MATRIX.get(
        (level.lower(), difficulty.lower()),
        DIFFICULTY_MATRIX[("mid", "medium")],
    )


def has_behavioral_drift(text: str) -> bool:
    lowered = text.lower()
    return any(phrase in lowered for phrase in FORBIDDEN_TECHNICAL_PHRASES)


def _short_spoken(value: str) -> str:
    text = " ".join(value.split()).strip()
    parts = re.findall(r"[^.!?]+[.!?]+|[^.!?]+$", text)
    return " ".join(part.strip() for part in parts[:2]).strip()


def _reply_text(message: dict[str, Any]) -> str:
    content = message.get("content")
    if isinstance(content, list):
        content = " ".join(
            part.get("text", "") if isinstance(part, dict) else str(part)
            for part in content
        )
    for part in (content, message.get("reasoning"), message.get("reasoning_content")):
        if part and str(part).strip():
            return str(part).strip()
    return ""


def _call_llm_json(
    model: str,
    system_prompt: str,
    user_payload: str,
    schema_name: str,
    schema: dict[str, Any],
    max_tokens: int,
    temperature: float,
    timeout: int,
) -> dict[str, Any] | None:
    load_local_env()
    key = os.environ.get("PRACTICE_ROOM_LLM_KEY", "").strip()
    if not key:
        return None
    base = os.environ.get("PRACTICE_ROOM_LLM_BASE", "https://api.openai.com/v1").rstrip("/")
    body: dict[str, Any] = {
        "model": model,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_payload},
        ],
    }
    use_json_object = "groq.com" in base
    for attempt in range(2):
        attempt_body = dict(body)
        if use_json_object:
            attempt_body["response_format"] = {"type": "json_object"}
        request = urllib.request.Request(
            f"{base}/chat/completions",
            data=json.dumps(attempt_body).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
                "User-Agent": BROWSER,
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                data = json.loads(response.read().decode("utf-8"))
            text = _reply_text(data["choices"][0]["message"])
            if text.startswith("```"):
                text = re.sub(r"^```(?:json)?|```$", "", text, flags=re.M).strip()
            found = re.search(r"\{.*\}", text, re.S)
            parsed = json.loads(found.group(0) if found else text)
            if isinstance(parsed, dict):
                return parsed
            return None
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", "replace")[:400]
            if error.code == 400 and use_json_object and ("response_format" in detail or "json" in detail.lower()):
                use_json_object = False
                continue
            if attempt == 0 and error.code in (400, 404) and body["model"] != "llama-3.1-8b-instant":
                body["model"] = "llama-3.1-8b-instant"
                continue
            return None
        except (TimeoutError, urllib.error.URLError, json.JSONDecodeError, KeyError, IndexError, TypeError):
            return None
    return None


def _planner_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "hooks": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "section": {"type": "string", "enum": ["Background", "Core concepts", "Follow-ups"]},
                        "topic": {"type": "string"},
                        "source": {"type": "string", "enum": ["resume", "jd", "skills"]},
                        "claim_to_probe": {"type": "string"},
                    },
                    "required": ["section", "topic", "source", "claim_to_probe"],
                },
            },
            "questions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "sectionName": {"type": "string"},
                        "prompt": {"type": "string"},
                        "followUpPrompt": {"type": "string"},
                    },
                    "required": ["sectionName", "prompt", "followUpPrompt"],
                },
            },
        },
        "required": ["hooks", "questions"],
    }


def _shadow_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "score": {"type": "integer"},
            "signal_detected": {"type": "string"},
            "next_action": {
                "type": "string",
                "enum": [
                    "PROBE_DEEPER",
                    "PIVOT_HARDER",
                    "GIVE_HINT",
                    "MOVE_NEXT_TOPIC",
                    "ANSWER_CANDIDATE_QUESTION",
                ],
            },
            "target_claim": {"type": "string"},
            "rubric_note": {"type": "string"},
            "topic_summary": {"type": "string"},
        },
        "required": ["score", "signal_detected", "next_action", "target_claim", "rubric_note", "topic_summary"],
    }


def _conductor_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "spoken_line": {"type": "string"},
            "hint": {"type": "string"},
            "internal_note": {"type": "string"},
        },
        "required": ["spoken_line", "hint", "internal_note"],
    }


def plan_technical_interview(payload: dict[str, Any]) -> dict[str, Any] | None:
    """Parse Resume + JD + Role + Level into a structured Technical Blueprint (hooks + 3 section questions)."""
    load_local_env()
    base = os.environ.get("PRACTICE_ROOM_LLM_BASE", "https://api.openai.com/v1").rstrip("/")
    configured = os.environ.get("PRACTICE_ROOM_LLM_MODEL", "gpt-4o-mini")
    model = "llama-3.3-70b-versatile" if "groq.com" in base else configured

    level = str(payload.get("experienceLevel") or "mid")
    difficulty = str(payload.get("difficulty") or "medium")
    calibration = difficulty_guidance(level, difficulty)
    sections = [str(s) for s in (payload.get("sections") or ["Background", "Core concepts", "Follow-ups"])]

    system_prompt = f"""You are a senior technical interview architect.
Build a structured Technical Interview Blueprint from the candidate's form inputs.
Return JSON only matching the schema.

Calibration:
{calibration}

Rules:
1. Extract 3 to 4 concrete technical hooks from the resume, job description, and skills. Each hook must name a specific system, technology, or requirement from the inputs (never invent employers or tools not present).
2. Write exactly 3 questions matching these exact sectionNames in order: {sections}.
   - Background: Pick ONE concrete system/project from the resume (or skills if no resume) and ask ONE focused question about its architecture, data flow, or design choice.
   - Core concepts: Ask ONE deep fundamental/mechanism question grounded in their skills/stack with a concrete scenario or input/cost.
   - Follow-ups: Take ONE requirement from the job description/role and ask how they would handle an incomplete detail, bottleneck, or failure mode.
3. Strict One-Question-Per-Turn Rule: Each prompt must ask AT MOST ONE clear question (1-2 short sentences, natural spoken English). Do NOT stack multi-part questions.
4. NEVER use behavioral STAR prompts ("tell me about a time", "disagreed with", "team look like", "looking back", "project you owned").
5. followUpPrompt is a private claim to probe if their answer is vague (never read aloud)."""

    brief = {
        "company": str(payload.get("company") or ""),
        "role": str(payload.get("role") or ""),
        "experienceLevel": level,
        "difficulty": difficulty,
        "persona": str(payload.get("persona") or "recruiter"),
        "skills": payload.get("skills") or [],
        "description": str(payload.get("description") or "")[:600],
        "resume": str(payload.get("resume") or "")[:1600],
        "materials": str(payload.get("materials") or "")[:800],
        "sections": sections,
    }

    parsed = _call_llm_json(
        model=model,
        system_prompt=system_prompt,
        user_payload=json.dumps(brief),
        schema_name="technical_blueprint",
        schema=_planner_schema(),
        max_tokens=900,
        temperature=0.35,
        timeout=14,
    )
    if not parsed:
        return None
    try:
        blueprint = TechnicalBlueprint.model_validate(parsed)
    except Exception:
        return None

    questions = []
    for idx, section_name in enumerate(sections):
        q = blueprint.questions[idx] if idx < len(blueprint.questions) else blueprint.questions[-1]
        if has_behavioral_drift(q.prompt):
            return None
        questions.append({
            "sectionName": section_name,
            "prompt": _short_spoken(q.prompt),
            "followUpPrompt": q.followUpPrompt.strip(),
        })

    return {
        "questions": questions,
        "hooks": [hook.model_dump() for hook in blueprint.hooks],
    }


def _detect_opt_out(answer: str) -> str:
    text = re.sub(r"[^a-z' ]", " ", answer.lower())
    text = re.sub(r"\s+", " ", text).strip()
    if "what" in text and "mean" in text:
        return ""
    cues = (
        "don't know", "dont know", "do not know",
        "don't recall", "dont recall", "do not recall",
        "don't remember", "do not remember", "dont remember",
        "exact syntax", "no idea", "not sure", "not familiar",
        "haven't done", "have not done", "havent done",
        "haven't used", "have not used", "havent used",
        "haven't worked", "have not worked", "havent worked",
        "never done", "never used",
        "i'll work on it", "i will work on it", "ill work on it", "i can work on it",
        "brush up", "i'll look into", "i will look into", "look into it",
        "skip this", "next question", "pass on this", "move on",
    )
    if not any(cue in text for cue in cues):
        return ""
    explained = any(marker in text for marker in ("but ", "conceptually", "the idea", "it works", "works by", "in principle", "roughly "))
    if explained and len(text.split()) >= 12:
        return "conceptual_pass"
    return "polite_opt_out"


def _detect_candidate_question(answer: str) -> bool:
    text = re.sub(r"[^a-z\s?]", " ", answer.lower())
    text = re.sub(r"\s+", " ", text).strip()
    cues = (
        "what does", "what do you mean", "what that means", "what this means", "what it means",
        "meaning of", "can you explain", "could you explain", "please explain", "elaborate",
        "dont understand", "do not understand", "didnt understand", "did not understand",
        "not understand", "i dont get", "what are you asking", "which question",
        "what question", "can you repeat", "repeat the question", "clarify",
    )
    if any(cue in text for cue in cues):
        return True
    return text.endswith("?") and len(text.split()) <= 18


def _shadow_evaluator_node(state: TechnicalTurnState) -> TechnicalTurnState:
    payload = state["payload"]
    answer = str(payload.get("answer") or "").strip()
    section = str(payload.get("section") or "Background")
    probes = int(payload.get("probes") or 0)
    force_transition = bool(payload.get("forceTransition"))
    wrap_up_section = bool(payload.get("wrapUpSection"))

    if _detect_candidate_question(answer):
        return {
            "clarifying": True,
            "outcome": "",
            "evaluation": {
                "score": 3,
                "signal_detected": "candidate_question",
                "next_action": "ANSWER_CANDIDATE_QUESTION",
                "target_claim": answer[:180],
                "rubric_note": f"Candidate asked for clarification in {section}.",
                "topic_summary": f"Clarifying question in {section}.",
            },
        }

    opt_out = _detect_opt_out(answer)
    if opt_out:
        return {
            "clarifying": False,
            "outcome": opt_out,
            "evaluation": {
                "score": 3 if opt_out == "conceptual_pass" else 2,
                "signal_detected": opt_out,
                "next_action": "MOVE_NEXT_TOPIC",
                "target_claim": "",
                "rubric_note": f"Candidate passed honestly ({opt_out}) in {section}.",
                "topic_summary": f"Opted out in {section}; moving forward.",
            },
        }

    if force_transition:
        return {
            "clarifying": False,
            "outcome": "",
            "evaluation": {
                "score": 3,
                "signal_detected": "section_time_elapsed",
                "next_action": "MOVE_NEXT_TOPIC",
                "target_claim": answer[:160],
                "rubric_note": f"Section {section} time budget reached; transitioning.",
                "topic_summary": f"Completed {section} discussion.",
            },
        }

    if bool(payload.get("rotateTopicInSection")):
        return {
            "clarifying": False,
            "outcome": "",
            "evaluation": {
                "score": 4,
                "signal_detected": "rotate_topic_in_section",
                "next_action": "PIVOT_HARDER",
                "target_claim": f"Ask a fresh question on a different mechanism or edge case within {section}.",
                "rubric_note": f"Completed prior thread in {section}; rotating to a fresh question in same section.",
                "topic_summary": f"Rotated to a fresh {section} question.",
            },
        }

    load_local_env()
    base = os.environ.get("PRACTICE_ROOM_LLM_BASE", "https://api.openai.com/v1").rstrip("/")
    configured = os.environ.get("PRACTICE_ROOM_LLM_MODEL", "gpt-4o-mini")
    fast_model = "llama-3.1-8b-instant" if "groq.com" in base else configured

    system_prompt = """You are a silent Shadow Evaluator for a live technical interview.
Evaluate the candidate's latest answer and return JSON only.

Decision rules for next_action:
- PROBE_DEEPER: The answer is vague, names a tool/buzzword without explaining how it works, or skips an edge case/failure mode. Set target_claim to the exact claim or tool from their answer to probe ("3-Why Rule").
- PIVOT_HARDER: The answer is solid and clear; raise the bar with a harder constraint, failure mode, or scale tradeoff.
- GIVE_HINT: The candidate is stuck or partially wrong; give a small nudge without giving away the answer.
- MOVE_NEXT_TOPIC: The candidate thoroughly answered the current question (or probes >= 2 and they covered enough), or wrapUpSection is true and we are ready to move on.

Never invent facts not in the answer. Keep rubric_note and topic_summary to one concise sentence each."""

    eval_input = {
        "section": section,
        "asked": str(payload.get("asked") or "")[:400],
        "answer": answer[:800],
        "probeNote": str(payload.get("probeNote") or "")[:200],
        "experienceLevel": str(payload.get("experienceLevel") or "mid"),
        "difficulty": str(payload.get("difficulty") or "medium"),
        "probes": probes,
        "wrapUpSection": wrap_up_section,
        "elapsedSeconds": payload.get("elapsedSeconds", 0),
        "allocatedSeconds": payload.get("allocatedSeconds", 0),
        "compressedSummary": str(payload.get("compressedSummary") or "")[:400],
    }

    parsed = _call_llm_json(
        model=fast_model,
        system_prompt=system_prompt,
        user_payload=json.dumps(eval_input),
        schema_name="shadow_evaluation",
        schema=_shadow_schema(),
        max_tokens=220,
        temperature=0.1,
        timeout=5,
    )
    if parsed:
        try:
            validated = ShadowEvaluation.model_validate(parsed)
            eval_dict = validated.model_dump()
            if probes >= 2 and eval_dict["next_action"] in ("PROBE_DEEPER", "GIVE_HINT"):
                eval_dict["next_action"] = "MOVE_NEXT_TOPIC"
            return {"clarifying": False, "outcome": "", "evaluation": eval_dict}
        except Exception:
            pass

    # Deterministic fallback if fast model failed/timed out
    word_count = len(answer.split())
    next_action = "MOVE_NEXT_TOPIC" if (probes >= 2 or word_count >= 45) else "PROBE_DEEPER"
    return {
        "clarifying": False,
        "outcome": "",
        "evaluation": {
            "score": 4 if word_count >= 30 else 2,
            "signal_detected": "fallback_length_check",
            "next_action": next_action,
            "target_claim": answer[:140],
            "rubric_note": f"Evaluated {section} response ({word_count} words).",
            "topic_summary": f"Discussed {section}.",
        },
    }


def _conductor_node(state: TechnicalTurnState) -> TechnicalTurnState:
    payload = state["payload"]
    evaluation = state["evaluation"]
    next_action = evaluation["next_action"]
    section = str(payload.get("section") or "Background")
    next_section = str(payload.get("nextSection") or "")
    wrap_up_section = bool(payload.get("wrapUpSection"))
    force_transition = bool(payload.get("forceTransition"))
    practice_mode = str(payload.get("practiceMode") or "real")
    persona = str(payload.get("persona") or "recruiter")
    level = str(payload.get("experienceLevel") or "mid")
    difficulty = str(payload.get("difficulty") or "medium")
    calibration = difficulty_guidance(level, difficulty)

    persona_style = {
        "coach": "Warm, supportive, crisp. Never cheesy praise.",
        "recruiter": "Neutral, professional, concise.",
        "bar_raiser": "Direct, analytical, probes ownership, numbers, and tradeoffs.",
    }.get(persona, "Neutral, professional, concise.")

    transition_directive = ""
    if force_transition and next_section:
        transition_directive = f"HARD SECTION TRANSITION: Smoothly wrap up {section} and transition into {next_section} using nextHint."
    elif force_transition and not next_section:
        transition_directive = "INTERVIEW COMPLETE: Thank the candidate concisely and close the interview."
    elif next_action == "MOVE_NEXT_TOPIC" and next_section:
        transition_directive = f"MOVE TO NEXT SECTION: Acknowledge briefly and transition into {next_section} using nextHint."
    elif next_action == "MOVE_NEXT_TOPIC" and not next_section:
        transition_directive = "INTERVIEW COMPLETE: Thank the candidate concisely and close the interview."
    elif wrap_up_section:
        transition_directive = f"SOFT WRAP-UP (80% time): Ask ONE closing/summary question for {section} instead of opening a deep new topic."

    load_local_env()
    base = os.environ.get("PRACTICE_ROOM_LLM_BASE", "https://api.openai.com/v1").rstrip("/")
    configured = os.environ.get("PRACTICE_ROOM_LLM_MODEL", "gpt-4o-mini")
    conductor_model = "llama-3.3-70b-versatile" if "groq.com" in base else configured

    system_prompt = f"""You are the live Technical Interviewer (Conductor). Return JSON only.
Persona: {persona_style}
Calibration: {calibration}

Strict Rules:
1. spoken_line is read aloud by TTS. Write 1 or 2 short complete sentences (12-18 words each).
2. STRICT ONE-QUESTION-PER-TURN RULE: Ask AT MOST ONE question per turn. Never stack two questions.
3. No cheesy praise ("Great job!", "Awesome!"). Use brief, realistic acknowledgments ("Got it.", "Makes sense.", "Okay.").
4. React directly to the Shadow Evaluator's decision:
   - PROBE_DEEPER: Zero in on target_claim from their answer ("3-Why Rule"). Ask how it works, what breaks, or why that choice.
   - PIVOT_HARDER: Briefly acknowledge and add a harder constraint, failure mode, or scale tradeoff.
   - GIVE_HINT: Give one small conceptual nudge and re-ask the core idea simply.
   - ANSWER_CANDIDATE_QUESTION: Answer their question in 1 plain, helpful sentence, then ask the focused follow-up. Never quiz them on the word they asked about.
   - MOVE_NEXT_TOPIC: Follow transition_directive cleanly.
5. NEVER use behavioral STAR prompts ("tell me about a time", "disagreed with", "team look like", "looking back", "project you owned").
6. hint is "" unless practiceMode is "coach"."""

    conductor_input = {
        "section": section,
        "nextSection": next_section,
        "asked": str(payload.get("asked") or "")[:360],
        "answer": str(payload.get("answer") or "")[:700],
        "compressedSummary": str(payload.get("compressedSummary") or "")[:400],
        "nextAction": next_action,
        "signalDetected": evaluation.get("signal_detected", ""),
        "targetClaim": evaluation.get("target_claim", ""),
        "transitionDirective": transition_directive,
        "nextHint": str(payload.get("nextSeed") or payload.get("plannedPrompt") or "")[:360],
        "practiceMode": practice_mode,
        "company": str(payload.get("company") or ""),
        "role": str(payload.get("role") or ""),
        "skills": payload.get("skills") or [],
    }

    parsed = _call_llm_json(
        model=conductor_model,
        system_prompt=system_prompt,
        user_payload=json.dumps(conductor_input),
        schema_name="conductor_output",
        schema=_conductor_schema(),
        max_tokens=160,
        temperature=0.35,
        timeout=7,
    )

    spoken = ""
    hint = ""
    if parsed:
        try:
            out = ConductorOutput.model_validate(parsed)
            spoken = _short_spoken(out.spoken_line)
            hint = out.hint.strip() if practice_mode == "coach" else ""
        except Exception:
            spoken = ""

    if not spoken or has_behavioral_drift(spoken):
        if force_transition or next_action == "MOVE_NEXT_TOPIC":
            if next_section:
                seed = str(payload.get("nextSeed") or "").strip()
                if seed and not has_behavioral_drift(seed):
                    spoken = _short_spoken(f"Got it, let's move to {next_section}. {seed}")
                else:
                    spoken = f"Let's move to {next_section}. How would you approach a core requirement for this role under failure?"
            else:
                spoken = "Thank you for walking through those details with me. That completes the interview."
        elif next_action == "ANSWER_CANDIDATE_QUESTION":
            spoken = "In plain terms, I'm asking how that component behaves when a dependency slows down or fails. Using your system, what breaks first?"
        else:
            spoken = "Walk me through that mechanism on one concrete input, and name the main tradeoff."

    return {
        "conductor": {
            "spoken_line": spoken,
            "hint": hint,
        }
    }


def run_technical_turn(payload: dict[str, Any]) -> dict[str, Any]:
    """Execute one Shadow Evaluator + Conductor turn for a live technical interview."""
    state: TechnicalTurnState = {"payload": payload}
    state.update(_shadow_evaluator_node(state))
    state.update(_conductor_node(state))
    evaluation = state["evaluation"]
    conductor = state["conductor"]
    next_section = str(payload.get("nextSection") or "")
    force_transition = bool(payload.get("forceTransition"))
    next_action = evaluation["next_action"]

    if force_transition or next_action == "MOVE_NEXT_TOPIC":
        api_action = "advance" if next_section else "finish"
    else:
        api_action = "stay"

    return {
        "sectionName": str(payload.get("section") or ""),
        "prompt": conductor["spoken_line"],
        "action": api_action,
        "hint": conductor.get("hint", ""),
        "clarifying": bool(state.get("clarifying")),
        "outcome": state.get("outcome") or None,
        "rubricNote": evaluation.get("rubric_note", ""),
        "topicSummary": evaluation.get("topic_summary", ""),
        "signalDetected": evaluation.get("signal_detected", ""),
        "score": evaluation.get("score", 3),
    }

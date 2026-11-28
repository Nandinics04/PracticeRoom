import json
import os
from typing import Any, Literal

from pydantic import BaseModel, Field

from technical_graph import (
    _call_llm_json,
    _detect_candidate_question,
    _detect_opt_out,
    _short_spoken,
    load_local_env,
)

BEHAVIORAL_SECTIONS = [
    "Warm-up & Pitch",
    "Resume Deep-Dive",
    "Core Competency Scenarios",
    "Culture Fit & Reverse Q&A",
]

# Theme banks only — never recite these as fixed scripts. The LLM authors a fresh question per candidate.
SECTION_BANKS = {
    "Warm-up & Pitch": [
        "personal pitch / tell me about yourself",
        "professional background walkthrough",
        "what motivates them toward software engineering / this role",
        "key strengths (with a concrete example)",
    ],
    "Resume Deep-Dive": [
        "internship or recent role ownership",
        "primary responsibilities on a named project",
        "a challenging task during that work",
        "one project they are proud of",
        "technical decisions and why",
        "individual contribution (I, not only we)",
        "what they learned",
    ],
    "Core Competency Scenarios": [
        "ownership / taking responsibility",
        "problem-solving a complex issue",
        "disagreement with a teammate",
        "conflict or difficult team situation",
        "learning a new technology quickly",
        "tight deadline / time management",
        "a mistake and the learning",
        "improving a process (initiative)",
        "receiving constructive criticism",
        "decision with limited information",
    ],
    "Culture Fit & Reverse Q&A": [
        "why this company / role",
        "work environment where they perform best",
        "how they handle manager feedback",
        "where they see themselves in a few years",
        "why hire them (crisp differentiator)",
        "invite their reverse questions",
    ],
}

BEHAVIORAL_THEMES = [
    "Introduction & Background (journey, motivation, strengths/growth)",
    "Ownership & Responsibility (challenging task, initiative, deadlines, mistakes, priorities)",
    "Teamwork & Collaboration (disagreements, helping teammates, unequal contribution)",
    "Problem-Solving & Decision-Making (complex problems, incomplete info, pivots)",
    "Adaptability & Learning (new tech fast, shifting requirements, criticism)",
    "Leadership & Initiative (improving a process, influencing without authority)",
    "Motivation & Career Goals (why this role, trajectory, reverse questions)",
]
LEVEL_CALIBRATION = {
    "entry": "Entry / Junior (0-2 yrs): Focus on coachability, learning from mistakes, teamwork, and handling blockers.",
    "mid": "Mid-Level (2-5 yrs): Focus on end-to-end ownership, pushing back on requirements, and resolving peer disagreements.",
    "senior": "Senior+ (5+ yrs): Focus on cross-team influence, organizational ambiguity, mentoring, and strategic trade-offs.",
}


class ResumeAnchor(BaseModel):
    project_or_bullet: str = Field(min_length=4, max_length=160)
    angle_to_probe: str = Field(min_length=6, max_length=200)


class PlannedBehavioralQuestion(BaseModel):
    sectionName: str
    prompt: str = Field(min_length=12)
    followUpPrompt: str = Field(min_length=8)


class BehavioralBlueprint(BaseModel):
    reasoning: str = Field(default="", max_length=600)
    competencies: list[str] = Field(min_length=2, max_length=3)
    resume_anchors: list[ResumeAnchor] = Field(min_length=1, max_length=2)
    questions: list[PlannedBehavioralQuestion] = Field(min_length=4, max_length=4)


class StarStatus(BaseModel):
    situation: bool
    task: bool
    action: bool
    result: bool


class BehavioralTurnEvaluation(BaseModel):
    reasoning: str = Field(default="", max_length=500)
    star_status: StarStatus
    pronoun_flag: Literal["strong_i", "mostly_we", "vague_hypothetical"]
    red_flags: list[str] = Field(default_factory=list)
    next_action: Literal[
        "PROBE_ACTION",
        "PROBE_RESULT",
        "CHALLENGE_DECISION",
        "ANSWER_CANDIDATE_QUESTION",
        "MOVE_NEXT_COMPETENCY",
    ]
    probe_focus: str = Field(max_length=220)
    rubric_note: str = Field(min_length=5, max_length=220)
    topic_summary: str = Field(min_length=5, max_length=220)


class BehavioralConductorOutput(BaseModel):
    reasoning: str = Field(default="", max_length=500)
    spoken_line: str = Field(min_length=8, max_length=360)
    hint: str = Field(default="", max_length=200)
    internal_note: str = Field(default="", max_length=120)


def _blueprint_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "reasoning": {"type": "string"},
            "competencies": {"type": "array", "items": {"type": "string"}},
            "resume_anchors": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "project_or_bullet": {"type": "string"},
                        "angle_to_probe": {"type": "string"},
                    },
                    "required": ["project_or_bullet", "angle_to_probe"],
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
        "required": ["reasoning", "competencies", "resume_anchors", "questions"],
    }


def _shadow_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "reasoning": {"type": "string"},
            "star_status": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "situation": {"type": "boolean"},
                    "task": {"type": "boolean"},
                    "action": {"type": "boolean"},
                    "result": {"type": "boolean"},
                },
                "required": ["situation", "task", "action", "result"],
            },
            "pronoun_flag": {"type": "string", "enum": ["strong_i", "mostly_we", "vague_hypothetical"]},
            "red_flags": {"type": "array", "items": {"type": "string"}},
            "next_action": {
                "type": "string",
                "enum": [
                    "PROBE_ACTION",
                    "PROBE_RESULT",
                    "CHALLENGE_DECISION",
                    "ANSWER_CANDIDATE_QUESTION",
                    "MOVE_NEXT_COMPETENCY",
                ],
            },
            "probe_focus": {"type": "string"},
            "rubric_note": {"type": "string"},
            "topic_summary": {"type": "string"},
        },
        "required": [
            "reasoning",
            "star_status",
            "pronoun_flag",
            "red_flags",
            "next_action",
            "probe_focus",
            "rubric_note",
            "topic_summary",
        ],
    }


def _conductor_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "reasoning": {"type": "string"},
            "spoken_line": {"type": "string"},
            "hint": {"type": "string"},
            "internal_note": {"type": "string"},
        },
        "required": ["reasoning", "spoken_line", "hint", "internal_note"],
    }


def _section_bank_lines() -> str:
    blocks = []
    for section, themes in SECTION_BANKS.items():
        blocks.append(f"{section}:\n" + "\n".join(f"  - {theme}" for theme in themes))
    return "\n".join(blocks)


def plan_behavioral_interview(payload: dict[str, Any]) -> dict[str, Any] | None:
    """Generate a dynamic 4-section behavioral interview blueprint from Resume + JD + Role + Level."""
    load_local_env()
    base = os.environ.get("PRACTICE_ROOM_LLM_BASE", "https://api.openai.com/v1").rstrip("/")
    configured = os.environ.get("PRACTICE_ROOM_LLM_MODEL", "gpt-4o-mini")
    model = "llama-3.3-70b-versatile" if "groq.com" in base else configured

    level = str(payload.get("experienceLevel") or "mid").lower()
    calibration = LEVEL_CALIBRATION.get(level, LEVEL_CALIBRATION["mid"])
    sections = [str(s) for s in (payload.get("sections") or BEHAVIORAL_SECTIONS)]

    system_prompt = f"""You are a Hiring Manager designing a behavioral interview.
Use Chain-of-Thought in the "reasoning" field FIRST (private; never spoken). Then write questions.
Return JSON only with keys: reasoning, competencies, resume_anchors, questions.

Calibration:
{calibration}

Fixed section arc (minutes are enforced by the backend — you only author the opening seed per section):
1) Warm-up & Pitch (~3m)
2) Resume Deep-Dive (~8m)
3) Core Competency Scenarios (~14m) — deepest slot
4) Culture Fit & Reverse Q&A (~5m)
Optional wrap-up is handled separately after these sections.

Theme banks (inspiration only — NEVER copy these phrases as a fixed script; author a fresh question grounded in THIS candidate's resume/JD):
{_section_bank_lines()}

Competency arc reference:
{chr(10).join('- ' + t for t in BEHAVIORAL_THEMES)}

Chain-of-Thought steps inside "reasoning":
1. Scan resume + JD: name 1-2 concrete anchors (employer, project, stack, or responsibility).
2. Choose top 3 soft-skill competencies for this level and company.
3. For each of these exact sectionNames in order {sections}, pick ONE theme from that section's bank and rewrite it into a natural spoken question that names a resume/JD detail when possible.
4. Prefer Core Competency Scenarios themes that match the JD (e.g. ownership, teamwork, problem-solving) — not a random textbook list.
5. Culture Fit must invite reverse Q&A at the end of that seed or in followUpPrompt.

Rules:
- Exactly one question object per sectionName (4 total). Copy sectionName exactly.
- Each prompt: 1-2 short spoken sentences, under 35 words, AT MOST ONE question (no multi-part).
- followUpPrompt is a private claim to test (STAR gap: personal I-action, measurable result, or decision tradeoff) — never a second spoken question.
- Do not invent employers or projects not in the inputs.
- Do not output a canned list like "Tell me about a time you disagreed..." unless the resume/JD clearly supports that angle — still rewrite it for this candidate."""

    brief = {
        "company": str(payload.get("company") or ""),
        "role": str(payload.get("role") or ""),
        "experienceLevel": level,
        "difficulty": str(payload.get("difficulty") or "medium"),
        "skills": payload.get("skills") or [],
        "description": str(payload.get("description") or "")[:700],
        "resume": str(payload.get("resume") or "")[:1600],
        "materials": str(payload.get("materials") or "")[:800],
        "sections": sections,
    }

    parsed = _call_llm_json(
        model=model,
        system_prompt=system_prompt,
        user_payload=json.dumps(brief),
        schema_name="behavioral_blueprint",
        schema=_blueprint_schema(),
        max_tokens=1000,
        temperature=0.4,
        timeout=14,
    )
    if not parsed:
        return None
    try:
        blueprint = BehavioralBlueprint.model_validate(parsed)
    except Exception:
        return None

    questions = []
    for idx, section_name in enumerate(sections):
        q = blueprint.questions[idx] if idx < len(blueprint.questions) else blueprint.questions[-1]
        questions.append({
            "sectionName": section_name,
            "prompt": _short_spoken(q.prompt),
            "followUpPrompt": q.followUpPrompt.strip(),
        })
    return {
        "questions": questions,
        "competencies": blueprint.competencies,
        "resume_anchors": [a.model_dump() for a in blueprint.resume_anchors],
    }


def opening_behavioral_turn(payload: dict[str, Any]) -> dict[str, Any]:
    """Generate a dynamic LLM opening greeting for behavioral interviews (no static strings)."""
    load_local_env()
    base = os.environ.get("PRACTICE_ROOM_LLM_BASE", "https://api.openai.com/v1").rstrip("/")
    configured = os.environ.get("PRACTICE_ROOM_LLM_MODEL", "gpt-4o-mini")
    model = "llama-3.1-8b-instant" if "groq.com" in base else configured

    role = str(payload.get("role") or "this role").strip()
    company = str(payload.get("company") or "").strip()
    level = str(payload.get("experienceLevel") or "mid")
    seed = str(payload.get("plannedPrompt") or "").strip()

    system_prompt = """You are a Hiring Manager starting the Warm-up & Pitch section of a behavioral interview.
Use brief Chain-of-Thought in "reasoning" first, then return JSON: reasoning, spoken_line, hint, internal_note.
spoken_line: crisp 1-2 sentence welcome for this role/company, then ONE warm-up ask (pitch, background, or motivation) rewritten for this candidate — not a fixed script.
Do NOT praise excessively. Under 35 words. hint is ""."""

    parsed = _call_llm_json(
        model=model,
        system_prompt=system_prompt,
        user_payload=json.dumps({
            "role": role,
            "company": company,
            "experienceLevel": level,
            "seed": seed,
            "warmupThemes": SECTION_BANKS["Warm-up & Pitch"],
        }),
        schema_name="behavioral_opening",
        schema=_conductor_schema(),
        max_tokens=160,
        temperature=0.45,
        timeout=6,
    )
    if parsed:
        try:
            out = BehavioralConductorOutput.model_validate(parsed)
            return {"prompt": _short_spoken(out.spoken_line), "hint": ""}
        except Exception:
            pass
    if seed:
        return {"prompt": _short_spoken(seed), "hint": ""}
    where = f" at {company}" if company else ""
    return {
        "prompt": f"Thanks for joining for the {role} conversation{where}. Give me a quick snapshot of your recent work and what drew you to this role.",
        "hint": "",
    }


def _evaluate_behavioral_turn(payload: dict[str, Any]) -> tuple[dict[str, Any], str, bool]:
    answer = str(payload.get("answer") or "").strip()
    section = str(payload.get("section") or "Warm-up & Pitch")
    probes = int(payload.get("probes") or 0)
    force_transition = bool(payload.get("forceTransition"))
    wrap_up_flag = bool(payload.get("wrapUpSection"))
    difficulty = str(payload.get("difficulty") or "medium").lower()

    if _detect_candidate_question(answer):
        return {
            "star_status": {"situation": False, "task": False, "action": False, "result": False},
            "pronoun_flag": "strong_i",
            "red_flags": [],
            "next_action": "ANSWER_CANDIDATE_QUESTION",
            "probe_focus": answer[:180],
            "rubric_note": f"Candidate asked a question or doubt in {section}.",
            "topic_summary": f"Answered candidate question in {section}.",
        }, "", True

    opt_out = _detect_opt_out(answer)
    if opt_out:
        return {
            "star_status": {"situation": False, "task": False, "action": False, "result": False},
            "pronoun_flag": "strong_i",
            "red_flags": ["honest_opt_out"],
            "next_action": "MOVE_NEXT_COMPETENCY",
            "probe_focus": "",
            "rubric_note": f"Candidate passed honestly in {section}.",
            "topic_summary": f"Moved past {section} on candidate opt-out.",
        }, opt_out, False

    if force_transition:
        return {
            "star_status": {"situation": True, "task": True, "action": True, "result": True},
            "pronoun_flag": "strong_i",
            "red_flags": [],
            "next_action": "MOVE_NEXT_COMPETENCY",
            "probe_focus": "",
            "rubric_note": f"Completed {section} time limit.",
            "topic_summary": f"Completed {section}.",
        }, "", False

    if bool(payload.get("rotateTopicInSection")):
        return {
            "star_status": {"situation": True, "task": True, "action": True, "result": True},
            "pronoun_flag": "strong_i",
            "red_flags": [],
            "next_action": "CHALLENGE_DECISION",
            "probe_focus": f"Start a fresh scenario or new angle inside {section} (2 follow-ups reached on prior story).",
            "rubric_note": f"Completed story thread in {section}; rotating to new topic in same section.",
            "topic_summary": f"Rotated to a fresh {section} scenario.",
        }, "", False

    load_local_env()
    base = os.environ.get("PRACTICE_ROOM_LLM_BASE", "https://api.openai.com/v1").rstrip("/")
    configured = os.environ.get("PRACTICE_ROOM_LLM_MODEL", "gpt-4o-mini")
    fast_model = "llama-3.1-8b-instant" if "groq.com" in base else configured

    system_prompt = f"""You are a silent Shadow Evaluator (STAR Completeness & Authenticity Detector) for a behavioral interview.
Think step-by-step in "reasoning" first (private), then return JSON with keys: reasoning, star_status, pronoun_flag, red_flags, next_action, probe_focus, rubric_note, topic_summary.

Current section theme bank (for judging whether they covered this section's intent — do not invent new spoken questions here):
{chr(10).join('- ' + t for t in SECTION_BANKS.get(section, SECTION_BANKS['Core Competency Scenarios']))}

In "reasoning":
1. Check if the candidate asked a question/doubt or expressed confusion.
2. Evaluate which STAR elements (situation, task, action, result) are genuinely present.
3. Check pronoun ownership ("strong_i" vs "mostly_we" vs "vague_hypothetical").
4. Choose the single highest-signal next_action:
   - PROBE_ACTION: situation given, or mostly_we/vague_hypothetical, and individual actions are unclear.
   - PROBE_RESULT: actions described, but outcome, metrics, or learnings are missing.
   - CHALLENGE_DECISION: STAR is solid and difficulty is medium/hard — stress-test pushback, trade-offs, or alternatives.
   - MOVE_NEXT_COMPETENCY: STAR is complete for this thread, or wrap_up_flag is true, or Culture Fit reverse-Q is done.
- probe_focus: exact detail or quote from their last reply to ask about next.
- rubric_note: 1-sentence evidence note for the final report."""

    eval_input = {
        "section": section,
        "asked": str(payload.get("asked") or "")[:360],
        "answer": answer[:800],
        "difficulty": difficulty,
        "experienceLevel": str(payload.get("experienceLevel") or "mid"),
        "probes": probes,
        "wrap_up_flag": wrap_up_flag,
        "compressedSummary": str(payload.get("compressedSummary") or "")[:400],
    }

    parsed = _call_llm_json(
        model=fast_model,
        system_prompt=system_prompt,
        user_payload=json.dumps(eval_input),
        schema_name="behavioral_shadow_eval",
        schema=_shadow_schema(),
        max_tokens=240,
        temperature=0.1,
        timeout=5,
    )
    if parsed:
        try:
            validated = BehavioralTurnEvaluation.model_validate(parsed)
            return validated.model_dump(), "", False
        except Exception:
            pass

    words = answer.split()
    has_i = any(w.lower() in {"i", "my", "me", "mine"} for w in words)
    has_we = any(w.lower() in {"we", "our", "us"} for w in words)
    return {
        "star_status": {
            "situation": len(words) >= 12,
            "task": len(words) >= 18,
            "action": has_i and len(words) >= 20,
            "result": len(words) >= 45,
        },
        "pronoun_flag": "strong_i" if has_i else ("mostly_we" if has_we else "vague_hypothetical"),
        "red_flags": [] if has_i else ["unclear_personal_ownership"],
        "next_action": "PROBE_RESULT" if (has_i and len(words) >= 25) else "PROBE_ACTION",
        "probe_focus": answer[:160],
        "rubric_note": f"Evaluated {section} response ({len(words)} words).",
        "topic_summary": f"Discussed {section}.",
    }, "", False


def run_behavioral_turn(payload: dict[str, Any]) -> dict[str, Any]:
    """Execute one Behavioral Shadow Evaluator + Conductor turn."""
    evaluation, outcome, clarifying = _evaluate_behavioral_turn(payload)
    section = str(payload.get("section") or "Warm-up & Pitch")
    next_section = str(payload.get("nextSection") or "")
    role = str(payload.get("role") or "this role")
    level = str(payload.get("experienceLevel") or "mid")
    practice_mode = str(payload.get("practiceMode") or "real")
    wrap_up_flag = bool(payload.get("wrapUpSection"))
    force_transition = bool(payload.get("forceTransition"))
    remaining_time = max(0, int(payload.get("allocatedSeconds") or 0) - int(payload.get("elapsedSeconds") or 0))
    next_action = evaluation["next_action"]

    load_local_env()
    base = os.environ.get("PRACTICE_ROOM_LLM_BASE", "https://api.openai.com/v1").rstrip("/")
    configured = os.environ.get("PRACTICE_ROOM_LLM_MODEL", "gpt-4o-mini")
    conductor_model = "llama-3.3-70b-versatile" if "groq.com" in base else configured

    section_themes = SECTION_BANKS.get(section, SECTION_BANKS["Core Competency Scenarios"])
    system_prompt = f"""You are a Hiring Manager conducting a behavioral interview for a {role} ({level}) role.
Current Section: {section} | Remaining Time: {remaining_time}s
Shadow Evaluator Directive: {next_action} -> Focus on: {evaluation.get('probe_focus', '')}
Pronoun Flag: {evaluation.get('pronoun_flag', 'strong_i')} | Wrap-up Flag: {wrap_up_flag}

Use Chain-of-Thought in "reasoning" first (private), then return JSON: reasoning, spoken_line, hint, internal_note.

Section theme bank (pick a related angle if rotating topics; NEVER paste a bank line verbatim):
{chr(10).join('- ' + t for t in section_themes)}

In "reasoning":
1. Name one concrete detail from their last answer (project, company, teammate, decision).
2. Decide whether to deepen STAR on that story or rotate to another theme still inside {section}.
3. Draft ONE spoken question that sounds like a real interviewer, not a questionnaire.

Rules:
1. Be interactive: credit or challenge ONE detail from their answer, then ask exactly one question.
2. No cheesy praise ("Great job!", "Amazing story!"). Prefer "Got it," "Makes sense," "Let's dig into that."
3. spoken_line under 35 words, at most ONE question (no multi-part).
4. ANSWER_CANDIDATE_QUESTION: answer clearly in one sentence, then re-frame the current ask.
5. vague_hypothetical: pull them to a concrete past event.
6. mostly_we or PROBE_ACTION: ask what THEY personally did.
7. PROBE_RESULT: ask for outcome, metric, or learning.
8. CHALLENGE_DECISION: stress-test pushback, alternatives, or tradeoffs.
9. Wrap-up or MOVE_NEXT_COMPETENCY: bridge to {next_section or 'closing'}; in Culture Fit invite reverse questions if not asked yet.
10. nextHint is a private seed — rewrite it; never recite it word for word.
11. hint is "" unless practiceMode is "coach"."""

    conductor_input = {
        "section": section,
        "nextSection": next_section,
        "asked": str(payload.get("asked") or "")[:360],
        "answer": str(payload.get("answer") or "")[:700],
        "compressedSummary": str(payload.get("compressedSummary") or "")[:400],
        "nextHint": str(payload.get("nextSeed") or payload.get("plannedPrompt") or "")[:360],
        "practiceMode": practice_mode,
        "forceTransition": force_transition,
        "outcome": outcome,
        "sectionThemes": section_themes,
    }

    parsed = _call_llm_json(
        model=conductor_model,
        system_prompt=system_prompt,
        user_payload=json.dumps(conductor_input),
        schema_name="behavioral_conductor",
        schema=_conductor_schema(),
        max_tokens=150,
        temperature=0.35,
        timeout=7,
    )

    spoken = ""
    hint = ""
    if parsed:
        try:
            out = BehavioralConductorOutput.model_validate(parsed)
            spoken = _short_spoken(out.spoken_line)
            hint = out.hint.strip() if practice_mode == "coach" else ""
        except Exception:
            spoken = ""

    if not spoken:
        if force_transition or next_action == "MOVE_NEXT_COMPETENCY":
            if next_section:
                seed = str(payload.get("nextSeed") or "").strip()
                spoken = _short_spoken(f"Got it, let's move to {next_section}. {seed}" if seed else f"Let's move to {next_section}. Tell me about a specific situation from your recent work.")
            else:
                spoken = "Thank you for sharing those examples today. That wraps up our behavioral interview."
        elif next_action == "ANSWER_CANDIDATE_QUESTION":
            spoken = "Good question. I'm asking for a concrete example from your own past work—what you personally did and what resulted."
        elif evaluation.get("pronoun_flag") == "vague_hypothetical":
            spoken = "Tell me about a concrete time when that actually happened, rather than how you would usually handle it."
        elif next_action == "PROBE_RESULT":
            spoken = "What happened after you took that action, and what measurable result followed?"
        else:
            spoken = "What was your specific role in that decision, and what part did you personally execute?"

    api_action = "advance" if ((force_transition or next_action == "MOVE_NEXT_COMPETENCY") and next_section) else ("finish" if (force_transition or next_action == "MOVE_NEXT_COMPETENCY") else "stay")

    return {
        "sectionName": section,
        "prompt": spoken,
        "action": api_action,
        "hint": hint,
        "clarifying": clarifying,
        "outcome": outcome or None,
        "rubricNote": evaluation.get("rubric_note", ""),
        "topicSummary": evaluation.get("topic_summary", ""),
        "starStatus": evaluation.get("star_status"),
        "pronounFlag": evaluation.get("pronoun_flag"),
    }

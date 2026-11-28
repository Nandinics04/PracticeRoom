import csv
import hashlib
import json
import os
import re
import tempfile
import time
import urllib.error
import urllib.request
from html import unescape
from pathlib import Path
from urllib.parse import parse_qs, quote, unquote, urlparse

from mcp.server.mcpserver import MCPServer

mcp = MCPServer("practice-room")

DATASET_URL = "https://raw.githubusercontent.com/landthelab123/ai-lab-interview-questions/main/data/questions.csv"

def question_rows() -> list[dict]:
    cache_path = Path(tempfile.gettempdir()) / "practice-room-landthelab.csv"
    if not cache_path.exists() or cache_path.stat().st_size < 1000:
        cache_path.write_text(fetch_text(DATASET_URL), encoding="utf-8")
    with cache_path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))

def questions_for_text(text: str) -> list[dict]:
    try:
        rows = question_rows()
    except OSError:
        return []
    companies = sorted({row["company"] for row in rows if row.get("company")}, key=len, reverse=True)
    company = next((name for name in companies if re.search(rf"(?<![\w]){re.escape(name)}(?![\w])", text, re.I)), "")
    if not company:
        return []
    matched = [row for row in rows if row.get("company", "").lower() == company.lower() and row.get("question")]
    matched.sort(key=lambda row: row.get("last_asked") or "", reverse=True)
    return matched

def question_excerpt(row: dict) -> str:
    kind = (row.get("round") or row.get("type") or "interview").replace("_", " ")
    return (
        f"{row['question']} Reported for {row['company']} in a {kind} round"
        f" ({row.get('type', 'interview')}, last asked {row.get('last_asked', 'unknown')})."
    )

def asked_question(row: dict) -> str:
    title = row["question"].strip().rstrip(".")
    return title if title.endswith("?") else title

ROUNDS_FOR_TYPE = {
    "behavioral": ("behavioral",),
    "coding": ("coding", "practical"),
    "technical": ("practical", "ml_design"),
    "system_design": ("system_design", "ml_design"),
    "hr": ("behavioral",),
    "mixed": ("behavioral", "coding", "system_design", "practical", "ml_design"),
}


def pick_questions(rows: list[dict], count: int, interview_type: str = "technical") -> list[dict]:
    kinds = ROUNDS_FOR_TYPE.get(interview_type, ROUNDS_FOR_TYPE["technical"])
    chosen: list[dict] = []
    used: set[str] = set()
    for kind in kinds:
        if len(chosen) >= count:
            break
        match = next((row for row in rows if (row.get("round") or "").lower() == kind and row["question"] not in used), None)
        if match:
            chosen.append(match)
            used.add(match["question"])
    for row in rows:
        if len(chosen) >= count:
            break
        if (row.get("round") or "").lower() in kinds and row["question"] not in used:
            chosen.append(row)
            used.add(row["question"])
    return chosen

def points_from_excerpt(excerpt: str) -> list[str]:
    parts = re.split(r"\s+\|\s+|\n+", excerpt)
    points = []
    for part in parts:
        text = " ".join(part.split()).strip(" -")
        if len(text) >= 20:
            points.append(text[:220])
    if len(points) == 1 and len(points[0]) > 180:
        sentences = re.findall(r"[^.?!]{20,180}[.?!]", points[0])
        if len(sentences) >= 2:
            points = [sentence.strip()[:220] for sentence in sentences[:8]]
    return points


def is_methodology(text: str) -> bool:
    lowered = text.lower()
    markers = (
        "speech recognition",
        "natural language",
        "sentiment",
        "proctoring",
        "computer vision",
        "facial",
        "machine learning algorithms",
        "interview link",
        "synthesized voice",
        "hidden test",
        "hiring team",
        "human recruiters",
        "keep the focus",
    )
    return any(marker in lowered for marker in markers)


def prompt_for_point(point: str, section: str) -> str:
    text = point.strip().rstrip(".")
    if text.endswith("?"):
        return text
    topic = text[0].lower() + text[1:] if text else section.lower()
    if len(topic) > 140:
        topic = topic[:140].rsplit(" ", 1)[0]
    return f"Let's talk about {topic}. How did you approach that?"


def question_line(row: dict, interview_type: str) -> str:
    if interview_type in ("behavioral", "hr"):
        return row["question"].strip()
    return asked_question(row)


def prompt_for_type(text: str, interview_type: str) -> str:
    line = " ".join(text.split()).strip()
    if interview_type == "behavioral":
        if line.lower().startswith("tell me about a time"):
            return line
        return f"Tell me about a time this came up. {line} What did you do, and what was the result?"
    if interview_type == "hr":
        return f"Why does this matter to you for the role? {line}"
    if interview_type == "system_design":
        return f"How would you design for this? {line} What would you trade off?"
    if interview_type == "coding":
        if line.lower().startswith("problem statement"):
            return line
        return f"{line} Use the problem on the left. Name one choice in your solution."
    if interview_type == "technical":
        if re.search(r"\b(how did data|tradeoff|failure|index|input|requirement)\b", line, re.I):
            return line
        return f"{line} Stay on the mechanism and a concrete example, not a project story."
    return line


def typed_question(topic: str, section: str, interview_type: str, index: int) -> str:
    role = topic or "this role"
    by_type = {
        "behavioral": (
            f"Quickly, what does your current or recent team look like for {role}?",
            f"Tell me about a time you disagreed with someone while working as a {role}. What did you personally do?",
            "What did you learn from that experience that changed how you work today?",
        ),
        "coding": (
            f"Write a {role} function this role would use. State the arguments, the return value, one constraint, and one example whose output you have checked.",
            f"Write that {role} function, then name one choice you made.",
            "What is the time cost and the space cost of the function you just wrote?",
        ),
        "technical": (
            f"Pick one system from your resume for {role}. How did data move through it, and why that shape?",
            f"Core concept for {role}: take one small concrete input and say the result, then the cost of that approach.",
            f"One requirement for this {role} is unfinished. How would you meet it, and what would you verify first?",
        ),
        "system_design": (
            f"What are the requirements you would lock first for a {role} system?",
            "Sketch the design. Which part owns the hard work?",
            "What did you reject, and how does your design fail at higher scale?",
        ),
        "hr": (
            f"Why do you want this work as a {role}?",
            "Tell me about a team you wanted to stay with. What made it that way?",
            "What do you want from the next role that you do not have now?",
        ),
        "mixed": (
            f"Tell me about a project you owned as a {role}, and what your part in it was.",
            f"Walk me through one technical mechanism from that work for {role}. How did it work on one input?",
            f"Tell me about a time pressure hit that work as a {role}. What did you do, and what was the result?",
        ),
    }
    choices = by_type.get(interview_type, by_type["technical"])
    return choices[index % len(choices)]


def questions_from_supplied(sections: list[str], sources: list[dict], interview_type: str = "technical") -> list[dict]:
    points: list[str] = []
    seen: set[str] = set()
    for source in sources:
        if source.get("platform") != "supplied":
            continue
        for point in points_from_excerpt(source.get("excerpt", "")):
            if is_methodology(point):
                continue
            key = point.lower()
            if key in seen:
                continue
            seen.add(key)
            points.append(point)
    if not points:
        return []
    questions = []
    for index, section in enumerate(sections):
        point = points[index % len(points)]
        raw = prompt_for_point(point, section) if index < len(points) else (
            f"Let's stay with {point[0].lower()}{point[1:]}. What would you do differently?"
        )
        prompt = prompt_for_type(raw, interview_type)
        questions.append({
            "sectionName": section,
            "prompt": prompt,
            "followUpPrompt": {
                "behavioral": "Claim to test: they name a personal action and a result that can be checked.",
                "coding": "Claim to test: the approach is correct and they can name its time cost.",
                "system_design": "Claim to test: they can name what they rejected and why.",
                "hr": "Claim to test: the reason is specific to this role.",
            }.get(interview_type, "Claim to test: they can say how they know the mechanism, not only the tool name."),
        })
    return questions


@mcp.tool()
def draft_questions(topic: str, sections: list[str], sources: list[dict] | None = None, interviewType: str = "technical") -> list[dict]:
    """Write one interview question for each section."""
    supplied = questions_from_supplied(sections, sources or [], interviewType)
    if supplied:
        return supplied
    reported = pick_questions(questions_for_text(topic), len(sections), interviewType)
    follow = {
        "behavioral": "Claim to test: they name a personal action and a result that can be checked.",
        "coding": "Claim to test: the approach is correct and they can name its time cost.",
        "technical": "Claim to test: they can say how they know the mechanism, not only the tool name.",
        "system_design": "Claim to test: they can name what they rejected and why.",
        "hr": "Claim to test: the reason is specific to this role.",
        "mixed": "Claim to test: the example is specific enough to check.",
    }.get(interviewType, "Claim to test: they can say how they know the mechanism, not only the tool name.")
    def claim_for(section: str) -> str:
        if interviewType != "technical":
            return follow
        if section == "Background":
            return "Claim to test: they explain one tradeoff or failure mode in that system, not only the happy path."
        if section == "Core concepts":
            return "Claim to test: they can reason about cost or an applied case, not only a definition."
        return "Claim to test: they meet the job requirement with a concrete approach, not a slogan."

    if reported:
        return [
            {
                "sectionName": section,
                "prompt": prompt_for_type(question_line(reported[index], interviewType), interviewType) if index < len(reported) else typed_question(topic, section, interviewType, index),
                "followUpPrompt": claim_for(section),
            }
            for index, section in enumerate(sections)
        ]
    excerpts = [
        source.get("excerpt", "").strip()
        for source in (sources or [])
        if source.get("excerpt", "").strip() and not is_page_noise(source.get("excerpt", ""))
    ]
    return [
        {
            "sectionName": section,
            "prompt": (
                prompt_for_type(spoken_from_excerpt(excerpts[index % len(excerpts)], topic, section), interviewType)
                if excerpts
                else typed_question(topic, section, interviewType, index)
            ),
            "followUpPrompt": claim_for(section),
        }
        for index, section in enumerate(sections)
    ]


PREPARE = """You write the questions for one practice interview. Return JSON only:
{"questions":[{"sectionName":"","prompt":"","followUpPrompt":""}]}
The user message is a labeled form. Read it from top to bottom. An empty line is skipped. Every line that has a value must change at least one question: interviewType, company, role, skills, experienceLevel, difficulty, persona, description, resume, materials, and codingLanguage.
sections lists the section names in order. Copy each sectionName exactly. One question per section. The three questions must be different from each other. Do not ask the same project story in every section.
A different skill, role, company, resume, or job requirement must produce a different interview. Do not reuse a string-window puzzle, a generic "walk me through a coding problem", or "tell me about a project you owned" unless interviewType is behavioral or hr.
Be technically correct for that skill and level. Do not invent a language rule. Do not invent a tool, a project, or an employer that is not in the resume or the notes. Do not state an example output you have not computed by hand. Entry level is one clear mechanism. Mid level asks for a tradeoff. Senior adds one failure mode or an incomplete requirement.
codingLanguage is the language they chose for a coding round: cpp, python, typescript, or c. Write the function in that language and name it in the problem statement. cpp means C++. Do not switch to another language.
Structure the round by interviewType:
Coding. First prompt is a function in codingLanguage, not a design sketch. Name the function, the arguments, their types, and the return value. The task must be something that role or those skills actually involve. Use these labels and real line breaks:
Problem statement
Constraints
- one numeric bound from the task
- one numeric bound from the task
Example
Input: a literal value, such as [1, 2, 2] or "abba"
Output: the result of that input, computed by hand
Input and Output are both required. Never write "a tiny input", "the example", or "use the bounds named in the statement". The later prompts stay on that same function: ask them to write it, then ask for its time cost and space cost.
Technical: Introduction is spoken separately as a greeting only. Background names one system from the resume and asks how data moved and why that shape. Core concepts is the deepest slot: a fundamentals question on a skill from the form, with one concrete input, the result, and a cost or tradeoff. Follow-ups asks how they would meet one job requirement when a detail is missing or something fails. Never use behavioral story prompts in a technical round.
System design: requirements from the job description, then the design for that role, then one option they would reject.
Behavioral and HR: a past situation, the action they took, and a result that can be checked. A project story belongs here, not in a technical round.
Mixed: one introduction, one technical mechanism from the resume or the skills, one behavioral situation.
followUpPrompt is a private claim, not a question and not something to read aloud. Name the fact a wrong or vague answer would get wrong, so the live interviewer can ask how they know it. Do not write a second scripted question. Do not copy an online-judge statement."""

PREPARE_FAST = """Return JSON only:
{"questions":[{"sectionName":"","prompt":"","followUpPrompt":""}]}
Copy each sectionName exactly. One different question per section. Write from resume, skills, company, role, and jobRequirement. Never reuse a canned line.
Match interviewType strictly. Never mix rounds.
Technical (never behavioral): Background asks how one resume system moves data and why that shape. Core concepts asks a stack fundamental with one concrete input, the result, and a cost. Follow-ups asks how they would meet one jobRequirement when a detail is missing or a component fails. Forbidden phrases: "tell me about a time", "project you owned", "looking back", "what would you do differently".
Behavioral: Past experience is a STAR situation from the resume. Reflection asks what changed in how they work. Ownership must be personal ("I"), not only "we".
System design: Requirements first, then Design (APIs/data), then Tradeoffs (scale or failure). Seniority from experienceLevel.
Coding: First prompt starts with "Problem statement", names the function in codingLanguage, Constraints, Example Input and Output. Later sections stay on that same function.
HR: Motivation and Close stay warm. Career fit and growth, not algorithms.
Mixed: Introduction ownership hook, Technical one mechanism, Behavioral one STAR result.
followUpPrompt is a private claim of at least four words, never spoken aloud."""


def company_line(company: str) -> str:
    if company.strip().lower() == "google":
        return "Google interview. Coding and technical: constraints, one tradeoff, and the cost of the approach. Behavioral: personal ownership and an unclear situation."
    if not company.strip():
        return "No company was named. Stay with the role and the round."
    return f"Public {company} interview style for this role and level."


def requirement_phrase(description: str) -> str:
    text = " ".join(str(description or "").split()).strip()
    if len(text) < 12:
        return ""
    sentence = re.split(r"[.?!]", text)[0].strip()
    return sentence[:140]


def shape_for_form(prompt: str, payload: dict, index: int) -> str:
    interview_type = str(payload.get("interviewType") or "technical")
    if interview_type == "coding" and prompt.lower().startswith("problem statement"):
        return prompt
    level = str(payload.get("experienceLevel") or "mid")
    difficulty = str(payload.get("difficulty") or "medium")
    persona = str(payload.get("persona") or "recruiter")
    requirement = requirement_phrase(str(payload.get("description") or ""))
    skills = [str(skill).strip() for skill in payload.get("skills") or [] if str(skill).strip()]
    spoken = " ".join(prompt.split()).strip()
    last = index == max(len(payload.get("sections") or []) - 1, 0)
    if requirement and requirement.lower() not in spoken.lower() and last:
        spoken = f"The role needs this: {requirement}. {spoken}"
    elif skills and interview_type != "hr" and not any(skill.lower() in spoken.lower() for skill in skills[:3]):
        spoken = f"Stay with {', '.join(skills[:3])}. {spoken}"
    closer = {
        ("entry", "easy"): "Keep it to one example.",
        ("entry", "medium"): "Walk through one clear case.",
        ("entry", "hard"): "Name one case that would break the simple version.",
        ("mid", "easy"): "Name the choice you made.",
        ("mid", "medium"): "Name one tradeoff.",
        ("mid", "hard"): "Name the tradeoff and the constraint that would change it.",
        ("senior", "easy"): "Say which requirement you would leave open.",
        ("senior", "medium"): "One requirement is incomplete. What would you assume?",
        ("senior", "hard"): "One requirement is incomplete and the scale is larger. What do you assume, and what breaks?",
    }.get((level, difficulty), "")
    if closer and closer.lower() not in spoken.lower() and last:
        spoken = f"{spoken} {closer}"
    if index == 0 and str(payload.get("resume") or "").strip() and interview_type in {"behavioral", "hr", "mixed"}:
        spoken = f"{spoken} You can use a project from your resume."
    if persona == "bar_raiser" and index == 0 and interview_type in {"behavioral", "hr", "mixed"} and "who owned" not in spoken.lower():
        spoken = f"{spoken} Who owned the decision?"
    return spoken[:900]


QUESTION_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "interview_questions",
        "strict": True,
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
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
                }
            },
            "required": ["questions"],
        },
    },
}


def interview_terms(payload: dict) -> list[str]:
    aliases = {
        "c++": ["c++", "cpp", "cxx"],
        "cpp": ["c++", "cpp"],
        "javascript": ["javascript", "js"],
        "js": ["javascript", "js"],
        "node": ["node", "nodejs", "node.js"],
        "node.js": ["node", "nodejs", "node.js"],
        "react": ["react", "react.js"],
        "golang": ["golang", "go"],
        "go": ["golang", "go"],
    }
    raw: list[str] = []
    for skill in payload.get("skills") or []:
        raw.append(str(skill))
    for key in ("company", "role", "topic"):
        raw.append(str(payload.get(key) or ""))
    language = str(payload.get("codingLanguage") or "").strip().lower()
    raw.append({"cpp": "C++", "c": "C", "python": "Python", "typescript": "TypeScript"}.get(language, ""))
    terms: list[str] = []
    for value in raw:
        for token in re.findall(r"[a-z0-9+#.]+", value.lower()):
            if len(token) < 2 or token in {"at", "and", "the", "for", "with"}:
                continue
            for alias in aliases.get(token, [token]):
                if alias not in terms:
                    terms.append(alias)
    return terms


def behavioral_prompt(text: str) -> bool:
    lowered = text.lower()
    cues = (
        "tell me about a time",
        "project you owned",
        "looking back",
        "what would you do differently",
        "disagreed with",
        "walk me through your background",
        "what does your current or recent team",
        "team look like",
        "changed how you work",
        "personally own in that situation",
        "measurable result did you see",
        "star",
    )
    return any(cue in lowered for cue in cues)


def questions_usable(payload: dict, questions: list[dict]) -> bool:
    sections = [str(section) for section in payload.get("sections") or []]
    if len(questions) != len(sections) or not sections:
        return False
    kind = str(payload.get("interviewType") or "")
    for index, question in enumerate(questions):
        prompt = str(question.get("prompt") or "")
        if len(prompt.split()) < 8:
            return False
        if kind in {"technical", "coding", "system_design"} and behavioral_prompt(prompt):
            return False
        if kind == "coding" and index == 0 and not prompt.lower().startswith("problem statement"):
            return False
    return True


def questions_match_form(payload: dict, questions: list[dict]) -> bool:
    if not questions_usable(payload, questions):
        return False
    blob = " ".join(str(question.get("prompt") or "") for question in questions).lower()
    if "firstuniquewindow" in blob.replace(" ", ""):
        return False
    if "walk me through how you would solve a coding problem" in blob:
        return False
    terms = interview_terms(payload)
    return not terms or any(term in blob for term in terms)


def prepare_model_name(base: str, configured: str) -> str:
    if "groq.com" in base and "gpt-oss" in configured:
        return "llama-3.3-70b-versatile"
    return configured


def live_model_name(base: str, configured: str) -> str:
    """Strong live interviewer."""
    if "groq.com" in base:
        return "llama-3.3-70b-versatile"
    return configured


def question_model_name(base: str, configured: str) -> str:
    """Background / prep model — fast, runs while the other section is live."""
    if "groq.com" in base:
        return "llama-3.1-8b-instant"
    return configured


def strong_question_model_name(base: str, configured: str) -> str:
    """Stronger model for writing the initial section seeds."""
    if "groq.com" in base:
        return "llama-3.3-70b-versatile"
    return configured


def questions_from_model(payload: dict, redo: bool = False) -> list[dict]:
    load_local_env()
    key = os.environ.get("PRACTICE_ROOM_LLM_KEY", "").strip()
    if not key:
        raise RuntimeError("Set PRACTICE_ROOM_LLM_KEY so the interview can be prepared.")
    base = os.environ.get("PRACTICE_ROOM_LLM_BASE", "https://api.openai.com/v1").rstrip("/")
    configured = os.environ.get("PRACTICE_ROOM_LLM_MODEL", "gpt-4o-mini")
    model = strong_question_model_name(base, configured)
    note = " Rewrite every question from the role, skills, and job requirement." if redo else ""
    request_body = {
        "model": model,
        "temperature": 0.4,
        "max_tokens": 450,
        "messages": [
            {"role": "system", "content": PREPARE_FAST},
            {"role": "user", "content": form_brief(payload) + note},
        ],
    }
    use_schema = "groq.com" in base
    data = None
    for attempt in range(2):
        attempt_body = dict(request_body)
        if use_schema:
            attempt_body["response_format"] = QUESTION_SCHEMA
        request = urllib.request.Request(
            f"{base}/chat/completions",
            data=json.dumps(attempt_body).encode(),
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json", "User-Agent": BROWSER},
        )
        try:
            with urllib.request.urlopen(request, timeout=14) as response:
                data = json.loads(response.read().decode())
            break
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", "replace")[:400]
            if error.code == 400 and use_schema and ("json_schema" in detail or "response_format" in detail):
                use_schema = False
                continue
            if attempt == 0 and error.code in (400, 404):
                request_body["model"] = "llama-3.1-8b-instant"
                request_body.pop("reasoning_effort", None)
                continue
            return []
        except (TimeoutError, urllib.error.URLError):
            return []
    if data is None:
        return []
    text = reply_text(data["choices"][0]["message"])
    found = re.search(r"\{.*\}", text, re.S)
    try:
        parsed = json.loads(found.group(0) if found else text)
    except json.JSONDecodeError:
        return []
    questions = parsed.get("questions") if isinstance(parsed, dict) else None
    if not isinstance(questions, list):
        return []
    return [
        {
            "sectionName": str(question.get("sectionName") or ""),
            "prompt": str(question.get("prompt") or "").strip(),
            "followUpPrompt": str(question.get("followUpPrompt") or "").strip(),
        }
        for question in questions
        if isinstance(question, dict)
    ]


def looks_literal(value: str) -> bool:
    text = value.strip().strip("`")
    if not text or len(text) > 240:
        return False
    if re.search(r"\b(example|statement|constraint|tiny|placeholder|named in|a concrete|such as|the bounds)\b", text, re.I):
        return False
    return bool(re.search(r"\d|\[|\{|'|\"", text))


def concrete_example(prompt: str) -> tuple[str, str]:
    matches = list(re.finditer(r"Input:\s*(.+)", prompt, re.I))
    for found in reversed(matches):
        raw = found.group(1).strip().strip("`")
        parts = re.split(r"\s+Output:\s*", raw, maxsplit=1, flags=re.I)
        value = parts[0].strip().strip("`")
        output = parts[1].strip().strip("`") if len(parts) > 1 else ""
        if not output:
            later = re.search(r"Output:\s*(.+)", prompt[found.end():], re.I)
            output = later.group(1).strip().strip("`") if later else ""
        if looks_literal(value) and looks_literal(output):
            return value, output
    return "", ""


def example_lines(prompt: str, language: str) -> tuple[str, str]:
    value, output = concrete_example(prompt)
    if value and output:
        return value, output
    load_local_env()
    key = os.environ.get("PRACTICE_ROOM_LLM_KEY", "").strip()
    if not key:
        return "", ""
    base = os.environ.get("PRACTICE_ROOM_LLM_BASE", "https://api.openai.com/v1").rstrip("/")
    model = question_model_name(base, os.environ.get("PRACTICE_ROOM_LLM_MODEL", "gpt-4o-mini"))
    body = {
        "model": model,
        "temperature": 0,
        "max_tokens": 80,
        "messages": [
            {
                "role": "system",
                "content": "Add one worked example. Return exactly two lines and no other text:\nInput: <a literal value>\nOutput: <the result of that input>\nThe input must contain a number, a list, or a quoted string. Compute the output by hand. Do not explain.",
            },
            {"role": "user", "content": f"Language: {language or 'the language in the problem'}\n\n{prompt[:1200]}"},
        ],
    }
    request = urllib.request.Request(
        f"{base}/chat/completions",
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json", "User-Agent": BROWSER},
    )
    try:
        with urllib.request.urlopen(request, timeout=3) as response:
            data = json.loads(response.read().decode())
        text = data["choices"][0]["message"].get("content") or ""
    except (TimeoutError, urllib.error.URLError, json.JSONDecodeError, KeyError, IndexError):
        return "", ""
    return concrete_example(str(text))


def label_coding_prompt(question: dict, interview_type: str, index: int, language: str = "") -> dict:
    prompt = str(question.get("prompt") or "").strip()
    if interview_type != "coding" or index != 0 or not prompt:
        return question
    value, output = example_lines(prompt, language)
    if not value or not output:
        return question
    without_example = re.sub(r"\n*Example\b[\s\S]*$", "", prompt, flags=re.I)
    without_example = re.sub(r"\n*Input:\s*.*(?:\nOutput:\s*.*)?", "", without_example, flags=re.I)
    without_example = re.sub(r"\n*-\s*Use the bounds named in the statement\.?", "", without_example, flags=re.I).strip()
    if not without_example.lower().startswith("problem statement"):
        without_example = "Problem statement\n" + without_example
    return {**question, "prompt": f"{without_example}\n\nExample\nInput: {value}\nOutput: {output}"}


def form_brief(payload: dict) -> str:
    lines = []
    for key in ("interviewType", "company", "role", "experienceLevel", "difficulty", "codingLanguage"):
        text = " ".join(str(payload.get(key) or "").split())
        if text:
            lines.append(f"{key}: {text[:120]}")
    skills = payload.get("skills") or []
    if isinstance(skills, list):
        listed = ", ".join(str(skill).strip() for skill in skills if str(skill).strip())
    else:
        listed = " ".join(str(skills).split())
    if listed:
        lines.append(f"skills: {listed[:180]}")
    requirement = requirement_phrase(str(payload.get("description") or ""))
    if requirement:
        lines.append(f"jobRequirement: {requirement}")
    resume = " ".join(str(payload.get("resume") or "").split())
    if resume:
        lines.append(f"resume: {resume[:400]}")
    materials = " ".join(str(payload.get("materials") or "").split())
    if materials:
        lines.append(f"notes: {materials[:240]}")
    sections = payload.get("sections") or []
    lines.append("sections: " + ", ".join(str(section) for section in sections))
    lines.append("prepareVersion: interactive-live-6")
    return "\n".join(lines)


def field_covered(blob: str, text: str) -> bool:
    skip = {"this", "that", "with", "from", "your", "have", "will", "about", "into", "they", "them", "their", "role", "work", "using", "used", "need", "needs", "interview"}
    words = [word for word in re.findall(r"[a-z0-9+#.]+", text.lower()) if len(word) > 3 and word not in skip]
    if not words:
        return True
    return any(word in blob for word in words[:8])


def questions_verified(payload: dict, questions: list[dict]) -> bool:
    if not questions_match_form(payload, questions):
        return False
    kind = str(payload.get("interviewType") or "")
    blob = " ".join(str(question.get("prompt") or "") for question in questions).lower()
    if kind == "technical" and ("project you owned" in blob or "tell me about a time" in blob):
        return False
    if kind == "coding" and "problem statement" not in blob:
        return False
    for key in ("company", "role", "description"):
        if not field_covered(blob, str(payload.get(key) or "")):
            return False
    if kind == "technical" and not field_covered(blob, str(payload.get("resume") or "")[:500]):
        return False
    for question in questions:
        if len(str(question.get("followUpPrompt") or "").split()) < 4:
            return False
    return True


def plan_cache_path(payload: dict) -> Path:
    folder = Path(tempfile.gettempdir()) / "practice-room-plans"
    folder.mkdir(exist_ok=True)
    key = hashlib.sha256(form_brief(payload).encode("utf-8")).hexdigest()
    return folder / f"{key}.json"


def read_plan_cache(payload: dict) -> list[dict]:
    path = plan_cache_path(payload)
    if not path.exists():
        return []
    try:
        saved = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    return saved if isinstance(saved, list) else []


def write_plan_cache(payload: dict, questions: list[dict]) -> None:
    try:
        plan_cache_path(payload).write_text(json.dumps(questions), encoding="utf-8")
    except OSError:
        return


def prepare_questions(payload: dict) -> list[dict]:
    sources = list(payload.get("sources") or [])
    materials = " ".join(str(payload.get("materials") or "").split()).strip()
    if materials and not any(source.get("platform") == "supplied" for source in sources if isinstance(source, dict)):
        sources.append({"platform": "supplied", "excerpt": materials[:2000]})
        payload = {**payload, "sources": sources}
    cached = read_plan_cache(payload)
    if questions_usable(payload, cached):
        return cached
    sections = [str(section) for section in payload.get("sections") or []]
    topic = str(payload.get("topic") or "")
    interview_type = str(payload.get("interviewType") or "technical")
    try:
        questions = questions_from_model(payload)
    except (RuntimeError, urllib.error.URLError, TimeoutError):
        questions = []
    if len(questions) == len(sections):
        questions = [{**question, "sectionName": section} for question, section in zip(questions, sections)]
    from_model = questions_usable(payload, questions)
    if not from_model:
        questions = draft_questions(topic, sections, sources, interview_type)
        questions = [{**question, "sectionName": section} for question, section in zip(questions, sections)]
        from_model = False
    repaired = []
    for index, question in enumerate(questions):
        prompt = str(question.get("prompt") or "")
        section = sections[index] if index < len(sections) else str(question.get("sectionName") or "")
        if interview_type in {"technical", "coding", "system_design"} and behavioral_prompt(prompt):
            prompt = typed_question(topic, section, interview_type, index)
            from_model = False
        repaired.append({**question, "sectionName": section, "prompt": prompt})
    questions = repaired
    shaped = []
    for index, question in enumerate(questions):
        prompt = str(question.get("prompt") or "")
        if interview_type == "coding" and prompt.lower().startswith("problem statement"):
            shaped.append(question)
        else:
            shaped.append({**question, "prompt": shape_for_form(prompt, payload, index)})
    language = str(payload.get("codingLanguage") or "")
    ready = [label_coding_prompt(question, interview_type, index, language) for index, question in enumerate(shaped)]
    if from_model and questions_usable(payload, ready):
        write_plan_cache(payload, ready)
    return ready


BROWSER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"

def fetch_text(url: str) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": BROWSER})
    with urllib.request.urlopen(request, timeout=12) as response:
        return response.read().decode("utf-8", "replace")

def visible_text(page: str) -> str:
    page = re.sub(r"(?is)<script.*?>.*?</script>", " ", page)
    page = re.sub(r"(?is)<style.*?>.*?</style>", " ", page)
    page = re.sub(r"(?is)<[^>]+>", " ", page)
    return re.sub(r"\s+", " ", unescape(page)).strip()

def fetch_page(url: str) -> str:
    try:
        page = fetch_text(url)
        if len(visible_text(page)) > 400:
            return page
    except OSError:
        page = ""
    return fetch_text(f"https://r.jina.ai/{url}")


def is_page_noise(text: str) -> bool:
    lowered = text.lower()
    markers = (
        "browser extension",
        "salary calculator",
        "employees choice",
        "hello, guest",
        "rate now",
        "are you paid fairly",
        "login for employers",
        "compare companies",
    )
    return any(marker in lowered for marker in markers)


def spoken_from_excerpt(excerpt: str, topic: str, section: str) -> str:
    text = " ".join(excerpt.split())
    if is_page_noise(text) or len(text) > 220:
        return f"Tell me about your work as a {topic}. What did you own in {section.lower()}?"
    if text.endswith("?"):
        return text
    clipped = text[:180].rsplit(" ", 1)[0] if len(text) > 180 else text
    return f"{clipped} How would you approach that?"


def useful_point(text: str) -> bool:
    lowered = text.lower().strip()
    if lowered.endswith(":") or lowered.startswith("[guide]") or lowered.startswith("how i "):
        return False
    if lowered.startswith("phase ") and "." not in text:
        return False
    return len(text) >= 36 or "?" in text


def preparation_points(page: str) -> list[str]:
    pieces: list[str] = []
    for pattern in (r"(?is)<h[1-3][^>]*>(.*?)</h[1-3]>", r"(?is)<li[^>]*>(.*?)</li>"):
        for raw in re.findall(pattern, page):
            text = visible_text(raw)
            if 12 <= len(text) <= 220:
                pieces.append(text)
    for line in page.splitlines():
        stripped = line.strip().replace("**", "")
        heading = re.match(r"^#{1,3}\s+(.+)$", stripped)
        item = re.match(r"^(?:[-*]|\d+\.)\s+(.+)$", stripped)
        text = (heading or item).group(1).strip() if heading or item else ""
        text = re.sub(r"\[(.*?)\]\(.*?\)", r"\1", text)
        if 12 <= len(text) <= 220:
            pieces.append(text)
    flat = visible_text(page)
    pieces.extend(re.findall(r"[A-Z][^?.!]{24,180}[?.!]", flat)[:12])
    points: list[str] = []
    seen: set[str] = set()
    for piece in pieces:
        key = piece.lower()
        if key in seen or not useful_point(piece):
            continue
        seen.add(key)
        points.append(piece)
        if len(points) == 8:
            break
    if points:
        return points
    for piece in pieces:
        key = piece.lower()
        if key in seen:
            continue
        seen.add(key)
        points.append(piece)
        if len(points) == 8:
            break
    return points


def read_supplied_material(query: str) -> dict:
    if query.startswith("http://") or query.startswith("https://"):
        page = fetch_page(query)
        points = preparation_points(page)
        excerpt = " | ".join(points) if points else visible_text(page)[:700]
        title = points[0][:120] if points else query
        return {"platform": "supplied", "title": title, "url": query, "excerpt": excerpt}
    excerpt = " ".join(query.split())[:1500]
    return {
        "platform": "supplied",
        "title": "Notes from the candidate",
        "url": "https://practice-room.local/notes",
        "excerpt": excerpt,
    }


def reported_question(text: str) -> str:
    match = re.search(r"Sample Question:\s*(.{20,240}?)(?:\s+\d+\.|\s+Round\b|$)", text)
    if match:
        return match.group(1).strip()
    sentences = re.findall(r"[^.?]{20,240}\?", text)
    return sentences[0].strip() if sentences else text[:400]

def result_url(href: str) -> str:
    href = unescape(href)
    if href.startswith("//"):
        href = "https:" + href
    return unquote(parse_qs(urlparse(href).query).get("uddg", [href])[0])

def search_subject(query: str) -> str:
    return re.sub(r"\bsite:\S+", "", query).strip()

def page_from_duckduckgo(query: str) -> dict | None:
    results = fetch_text(f"https://html.duckduckgo.com/html/?q={quote(query)}")
    links = re.findall(r'class="result__a" href="([^"]+)"[^>]*>(.*?)</a>', results)
    snippets = re.findall(r'class="result__snippet"[^>]*>(.*?)</a>', results)
    if not links:
        return None
    fallback = None
    for index, (href, title_html) in enumerate(links[:3]):
        target = result_url(href)
        title = visible_text(title_html)
        snippet = visible_text(snippets[index]) if index < len(snippets) else ""
        if fallback is None and len(snippet) > 40:
            fallback = {"title": title, "url": target, "excerpt": snippet}
        try:
            excerpt = reported_question(visible_text(fetch_text(target)))
        except OSError:
            continue
        if len(excerpt) > 40:
            return {"title": title, "url": target, "excerpt": excerpt}
    return fallback

def page_from_stack_overflow(subject: str) -> dict | None:
    titles = [subject]
    words = subject.split()
    if words:
        titles.append(f"{words[0]} interview")
    for title in titles:
        url = (
            "https://api.stackexchange.com/2.3/search?order=desc&sort=relevance"
            f"&intitle={quote(title)}&site=stackoverflow&pagesize=1&filter=withbody"
        )
        try:
            payload = json.loads(fetch_text(url))
        except OSError:
            return None
        items = payload.get("items") or []
        if not items:
            continue
        item = items[0]
        excerpt = reported_question(visible_text(item.get("body") or ""))
        link = item.get("link") or ""
        if len(excerpt) > 40 and link.startswith("https://"):
            return {"title": unescape(item.get("title") or title), "url": link, "excerpt": excerpt}
    return None

def cached_public_page(query: str) -> dict:
    reported = questions_for_text(query)
    if reported:
        row = reported[0]
        return {"title": row["question"], "url": row["url"], "excerpt": question_excerpt(row)}
    subject = search_subject(query)
    cache_path = Path(tempfile.gettempdir()) / "practice-room-search.json"
    lock_path = Path(str(cache_path) + ".lock")

    def read_cached() -> dict | None:
        if not cache_path.exists():
            return None
        saved = json.loads(cache_path.read_text(encoding="utf-8"))
        page = saved.get(subject)
        return page if isinstance(page, dict) else None

    cached = read_cached()
    if cached:
        return cached
    page = page_from_duckduckgo(query) or page_from_stack_overflow(subject)
    if not page:
        raise RuntimeError(f"No public page for {query}")
    owns_lock = False
    for _ in range(20):
        try:
            fd = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.close(fd)
            owns_lock = True
            break
        except FileExistsError:
            time.sleep(0.05)
    try:
        saved = {}
        if cache_path.exists():
            saved = json.loads(cache_path.read_text(encoding="utf-8"))
        current = saved.get(subject)
        if isinstance(current, dict):
            return current
        saved[subject] = page
        cache_path.write_text(json.dumps(saved), encoding="utf-8")
        return page
    finally:
        if owns_lock:
            lock_path.unlink(missing_ok=True)

@mcp.tool()
def search_public_web(platform: str, query: str) -> dict:
    """Find one public interview experience, or read material the candidate supplied."""
    if platform == "supplied":
        return read_supplied_material(query)
    page = cached_public_page(query)
    return {"platform": platform, **page}

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


INTERVIEWER = """You are the interviewer in a live practice interview. spoken_line is the only text that will be read aloud. internal_note is private and is never read aloud. action is stay, advance, or finish. hint is one sentence in coach mode, otherwise empty.
Never put action, internal_note, JSON, or tags inside spoken_line.
spoken_line is one complete sentence, or two when the second is necessary. Keep each sentence short, about twelve to eighteen words, and never stop in the middle of a sentence. internal_note is at most eight words. If allowStay is false, action is advance.
Persona coach: warm, then the question. Persona recruiter: neutral and brief. Persona bar_raiser: ask for the number, who owned the work, and the tradeoff.
Practice mode coach: hint names the missing piece a stronger answer would include. Practice mode real: hint is "".
company, role, skills, experienceLevel, difficulty, description, resume, and interviewType are the form filled in before the interview. Stay on that company, that role, and those skills. Do not switch to a different technology. Do not replace a technical or coding question with a generic project introduction.
A follow-up is spontaneous. probeNote is a private claim to test. Do not read probeNote aloud and do not recite a stored second question. If the answer is inaccurate, names a tool without saying how it works, or asserts a fact the answer does not support, action is stay. Stay on this same question. Sentence one names the inaccurate part. Sentence two asks how they know it. If the answer is accurate for this question, action is advance.
Opening: the candidate speaks first. When section is Introduction, greet the name they said, introduce yourself as their interviewer in one friendly sentence, then ask the planned question. Do not open a coding round by reading the problem aloud.
If their answer asks what a word means, or asks you to explain or elaborate, action is stay. Sentence one explains that word in plain language. Sentence two asks the same idea without the jargon, using a detail from their earlier answer when there is one. You explain. You never ask them to define the word. You never repeat the question in "asked".
Opt-out rule, checked before any stay: if they clearly say they do not know, do not remember the exact syntax, have not used it, have not worked on it, or will brush up or work on it later, action is advance. Say "No problem at all" and ask the planned next question. Do not quiz them and do not set hint. Stay only when they attempted an answer and it is still unclear on this same part: what they owned, a number, an edge case, or how one component behaves. If the answer already covers that part, advance. Do not stay to open a new topic. If they do not remember a name but then explain how it works, credit that idea in one short sentence and advance.
Coding: the problem in "asked" stays on the screen and the editor stays as they left it. Their message is typed, not transcribed. If it is a doubt or a question about that problem, action is stay. spoken_line answers that doubt in one or two clear sentences. Do not restate the problem. Do not start a new problem. Do not ask them to repeat the problem. Advance only when they say they are done, they want the next question, or they do not know. If codeResult says the runner executes JavaScript only, the code was not run. Do not tell them to fix a compile error. If they ask whether the code is fine, answer that. Agree when the approach is right. Name one concrete logic mistake only when you can point at that line. Do not say "fix the issues" without naming the mistake. In coach mode, a hint is one nudge, not the solution.
If company is Google, a coding or technical follow-up tests how they frame constraints or whether the approach is correct. A behavioral follow-up asks what they personally owned, or how they handled something unclear. Do not recite rubric names.
If interviewType is behavioral or hr and the answer has no personal action or no result, stay and ask for that missing piece, using one detail they said. The new prompt must be different from the question in "asked".
Never ask the same question again. If your prompt would match "asked", choose advance.
The answer was spoken. A word may still be a mishearing of a term in the resume or the question, such as sequel for SQL or APS for API. Understand the intended word. Do not ask about a misheard word, a country, a wheel, or any detail they did not clearly name. Ask about a tool, a document, or a choice that is actually in the answer.
probes is how many follow-ups you already asked on this question. For behavioral, technical, system design, and HR, two is the maximum. When probes is 2 or more and interviewType is not coding, action is advance. For coding, probes does not end the problem. Keep answering their doubts.
When you advance, ask the planned next question in your own words and tie it to one thing they said.
On the last section, after they answer it, finish.
Match interviewType. Behavioral and HR ask for a past situation, their action, and the result. Coding asks for an approach and a choice in the code. Technical asks how something named in the resume works, then a short puzzle, then one job requirement. Do not ask a technical candidate to tell a project story. System design asks for a requirement and a tradeoff. Do not ask a coding or design question in a behavioral or HR interview.
Speech pace, filler words, a hidden browser tab, and how many faces the camera sees can change your reply. Do not score accent, appearance, or emotion. Mention the camera or the tab only to invite them back.
Do not recite a methodology article. Do not say "keep the focus on"."""

INTERVIEWER_LIVE = """You are a live interviewer in a practice room. Return JSON only.
Fields: spoken_line (read aloud), action (stay|advance|finish), internal_note (private), hint (coach only).

STRUCTURE — read every turn in this order:
1) Inputs: interviewType, section, company, role, skills, resume, jobDescription, asked, answer, priorAnswer, topicHint, nextHint, probes, forceStayInSection, allowStay.
2) topicHint and nextHint are PRIVATE seeds. Never recite them word for word. Rewrite into a fresh spoken question that reacts to their last answer.
3) spoken_line must be interactive: credit or challenge one concrete detail from answer (or priorAnswer). Do not ignore what they said.
4) If they sound confused ("what situation", "what are you asking", "which question"), action is stay. Rephrase the current idea in plain words and ask one clear question. Do not jump to a new topic.
5) If the answer is weak, vague, or wrong and probes < 2, action is stay. Name the weak part, then ask one precise follow-up. Max two follow-ups on the same question.
6) If forceStayInSection is true, action must be stay. Ask another question in THIS section, still tied to their answer and interviewType.
7) If allowStay is false and forceStayInSection is false, action is advance.
8) If they clearly opt out (do not know / skip / next question) and forceStayInSection is false, action is advance with a short bridge, then a new question authored from topicHint/nextHint + their answer.
9) Never repeat asked. Never switch interviewType. Never paste JSON, action names, or tags into spoken_line.
10) spoken_line is one or two short complete sentences (about 12–18 words each).

TYPE LOCK:
- technical: mechanisms, data flow, APIs, storage, failure modes, cost/complexity, job requirements. Forbidden phrases: "tell me about a time", "disagreed with", "team look like", "looking back", "project you owned", "what would you do differently", "personally own in that situation".
- coding: stay on the on-screen problem; clarify doubts; do not invent a new problem.
- system_design: requirements, components, tradeoffs, scale and failure.
- behavioral: one past situation, their personal action, measurable result — still rewrite from their words, never a canned STAR script.
- hr: motivation and fit for this company/role.
- mixed: follow the current section's focus.

hint is "" unless practiceMode is coach."""


def reply_text(message: dict) -> str:
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


PLANNER = """Turn one practice request into an interview setup. Return JSON only:
{"mode":"job"|"skill","company":"","role":"","description":"","skills":[string],"interviewType":"behavioral"|"coding"|"technical"|"system_design"|"hr"|"mixed","experienceLevel":"entry"|"mid"|"senior","difficulty":"easy"|"medium"|"hard","durationMinutes":20}
If they name a company, mode is job. If they name only a skill, mode is skill and company is empty. Use the round they asked for. Behavioral means interviewType behavioral. Coding means interviewType coding. Technical or "software engineer interview" without a round means interviewType technical. If they name a company and no round, and the role is engineering, interviewType is technical (not behavioral). role is Software Engineer when they name none. experienceLevel is entry for new grad or L3, senior for senior or L5 and above, otherwise mid. description states the company, role, level, and round. Do not invent a company. durationMinutes is from 15 to 30."""


def plan_setup(request: str) -> dict:
    load_local_env()
    key = os.environ.get("PRACTICE_ROOM_LLM_KEY", "").strip()
    if not key:
        raise RuntimeError("Set PRACTICE_ROOM_LLM_KEY so the interview can be prepared.")
    base = os.environ.get("PRACTICE_ROOM_LLM_BASE", "https://api.openai.com/v1").rstrip("/")
    model = os.environ.get("PRACTICE_ROOM_LLM_MODEL", "gpt-4o-mini")
    body = json.dumps({
        "model": model,
        "temperature": 0.2,
        "max_tokens": 400,
        "reasoning": {"enabled": False},
        "messages": [
            {"role": "system", "content": PLANNER},
            {"role": "user", "content": request},
        ],
    }).encode()
    http = urllib.request.Request(
        f"{base}/chat/completions",
        data=body,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json", "User-Agent": BROWSER},
    )
    with urllib.request.urlopen(http, timeout=40) as response:
        data = json.loads(response.read().decode())
    text = reply_text(data["choices"][0]["message"])
    found = re.search(r"\{.*\}", text, re.S)
    return json.loads(found.group(0) if found else text)


EXPLAINER = """The candidate asked what a word in the question means. action is stay. hint is empty. internal_note is empty. spoken_line is the actual words you speak, two sentences. Never put action, JSON, or tags inside spoken_line.
The first sentence explains the word in plain language. The second sentence asks the original idea again without that word, using their project if they described one.
You explain. Do not ask them what the word means. Do not repeat the question in "asked". Do not describe the prompt. Say it.
When the word is reliability, this is the shape of the prompt: Reliability means the service still works when a payment fails or a time slot is already taken. In the booking service you described, what failed, or what were you worried would fail?
For any other word, explain that word in the same shape."""


REPAIR = """Correct one speech-to-text answer. Return JSON only: {"answer":"the corrected words"}.
Change a word only when it sounds like a term in the question, resume, company, or role. sequel can become SQL. react js can become React. APS can become API when API is in the resume or the question. deploid can become deployed when the resume says deployed.
Do not add a tool, a number, a company, or a sentence. Do not remove their story. If you are not sure, keep the original word."""


def groq_key() -> str:
    load_local_env()
    named = os.environ.get("PRACTICE_ROOM_GROQ_KEY", "").strip()
    if named:
        return named
    if "groq.com" in os.environ.get("PRACTICE_ROOM_LLM_BASE", ""):
        return os.environ.get("PRACTICE_ROOM_LLM_KEY", "").strip()
    return ""


def whisper_prompt(payload: dict) -> str:
    glossary = [
        "IIIT", "Hyderabad", "CampX", "edtech", "LangChain", "LangGraph", "LangSmith",
        "SQLAlchemy", "Python", "API", "React", "Node", "Kubernetes", "internship",
        "backend", "hallucination", "citation",
    ]
    source = " ".join(str(payload.get(key) or "") for key in ("resume", "skills", "hint"))
    names: list[str] = []
    ordinary = {"built", "the", "this", "that", "with", "from", "using", "worked", "developed", "project", "about", "and", "for", "into", "over"}
    for match in re.findall(r"\b[A-Z][A-Za-z0-9+.#-]{2,}(?:\s+[A-Z][A-Za-z0-9+.#-]{2,}){0,2}", source):
        words = [word for word in match.split() if word.lower() not in ordinary]
        name = " ".join(words)
        if name and name not in names:
            names.append(name)
    lowered = source.lower()
    for word in glossary:
        if word.lower() in lowered and word not in names:
            names.append(word)
    for word in glossary:
        if word not in names:
            names.append(word)
    question = " ".join(str(payload.get("question") or payload.get("hint") or "").split())
    question = re.sub(r"<[^>]+>", " ", question)
    question = re.sub(r"\{.*$", "", question).strip()[:280]
    text = f"Indian English technical interview. Project names and skills: {', '.join(names[:32])}."
    if question:
        text = f"{text} Question asked: {question}"
    return text[:850]


def transcribe_speech(payload: dict) -> dict:
    import base64
    key = groq_key()
    audio = str(payload.get("audio") or "")
    if not key or not audio:
        return {"text": "", "error": "The Groq key is missing, so the recording was not transcribed."}
    raw = base64.b64decode(audio)
    mime = "audio/webm" if "webm" in str(payload.get("mime") or "") else "audio/wav"
    prompt = whisper_prompt(payload)
    boundary = "practice-room-speech"
    filename = "answer.webm" if mime == "audio/webm" else "answer.wav"
    last_error = "Whisper could not transcribe the recording."
    for model_name in ("whisper-large-v3-turbo", "whisper-large-v3"):
        body = b"".join([
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"model\"\r\n\r\n{model_name}\r\n".encode(),
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"language\"\r\n\r\nen\r\n".encode(),
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"temperature\"\r\n\r\n0\r\n".encode(),
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"prompt\"\r\n\r\n{prompt}\r\n".encode(),
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{filename}\"\r\nContent-Type: {mime}\r\n\r\n".encode(),
            raw,
            f"\r\n--{boundary}--\r\n".encode(),
        ])
        request = urllib.request.Request(
            "https://api.groq.com/openai/v1/audio/transcriptions",
            data=body,
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": f"multipart/form-data; boundary={boundary}",
                "User-Agent": BROWSER,
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=4) as response:
                data = json.loads(response.read().decode())
            text = str(data.get("text") or "").strip()
            if not text:
                return {"text": "", "error": "Whisper returned no words for that recording."}
            return {"text": text, "error": ""}
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", "replace")[:180]
            last_error = detail or "Whisper refused the recording."
            if error.code in (400, 404) and model_name.endswith("turbo"):
                continue
            return {"text": "", "error": last_error}
        except TimeoutError:
            return {"text": "", "error": "Whisper took too long. Say that once more."}
        except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError) as error:
            return {"text": "", "error": str(error) or "Whisper could not transcribe the recording."}
    return {"text": "", "error": last_error}


def repair_spoken(payload: dict) -> str:
    original = str(payload.get("answer") or "").strip()
    if len(original.split()) < 8:
        return original
    load_local_env()
    key = os.environ.get("PRACTICE_ROOM_LLM_KEY", "").strip()
    if not key:
        return original
    base = os.environ.get("PRACTICE_ROOM_LLM_BASE", "https://api.openai.com/v1").rstrip("/")
    model = question_model_name(base, os.environ.get("PRACTICE_ROOM_LLM_MODEL", "gpt-4o-mini"))
    body = json.dumps({
        "model": model,
        "temperature": 0,
        "max_tokens": 120,
        "messages": [
            {"role": "system", "content": REPAIR},
            {"role": "user", "content": json.dumps({
                "answer": original,
                "question": payload.get("question") or "",
                "resume": str(payload.get("resume") or "")[:1500],
                "company": payload.get("company") or "",
                "role": payload.get("role") or "",
                "jobDescription": str(payload.get("jobDescription") or "")[:800],
            })},
        ],
    }).encode()
    try:
        http = urllib.request.Request(
            f"{base}/chat/completions",
            data=body,
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json", "User-Agent": BROWSER},
        )
        with urllib.request.urlopen(http, timeout=4) as response:
            data = json.loads(response.read().decode())
        text = reply_text(data["choices"][0]["message"])
        found = re.search(r"\{.*\}", text, re.S)
        parsed = json.loads(found.group(0) if found else text)
        cleaned = str(parsed.get("answer") or "").strip()
        if not cleaned:
            return original
        if len(cleaned.split()) > len(original.split()) * 1.25 + 4:
            return original
        return cleaned
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError):
        return original


def turn_outcome(answer: str) -> str:
    text = re.sub(r"[^a-z' ]", " ", answer.lower())
    text = re.sub(r"\s+", " ", text).strip()
    if "what" in text and "mean" in text:
        return ""
    cues = (
        "don't know",
        "dont know",
        "do not know",
        "don't recall",
        "dont recall",
        "do not recall",
        "don't remember",
        "do not remember",
        "dont remember",
        "exact syntax",
        "no idea",
        "not sure",
        "not familiar",
        "haven't done",
        "have not done",
        "havent done",
        "haven't used",
        "have not used",
        "havent used",
        "haven't worked",
        "have not worked",
        "havent worked",
        "never done",
        "never used",
        "i'll work on it",
        "i will work on it",
        "ill work on it",
        "i can work on it",
        "brush up",
        "i'll look into",
        "i will look into",
        "look into it",
        "skip this",
        "next question",
        "pass on this",
        "move on",
    )
    if not any(cue in text for cue in cues):
        return ""
    explained = any(marker in text for marker in ("but ", "conceptually", "the idea", "it works", "works by", "in principle", "roughly "))
    if explained and len(text.split()) >= 12:
        return "conceptual_pass"
    return "polite_opt_out"


def dynamic_next_prompt(payload: dict) -> str:
    """Author a type-locked next line. Never paste a scripted seed."""
    kind = str(payload.get("interviewType") or "technical")
    asked = str(payload.get("asked") or "")
    seed = short_spoken(str(payload.get("nextSeed") or payload.get("plannedPrompt") or ""))
    if kind in {"technical", "coding", "system_design"} and (not seed or behavioral_prompt(seed) or same_line(seed, asked)):
        return opening_task({**payload, "plannedPrompt": ""})
    if seed and not same_line(seed, asked) and not (kind in {"technical", "coding", "system_design"} and behavioral_prompt(seed)):
        # Paraphrase cue only — still rewrite into a short interactive ask.
        if kind == "technical":
            return "Building on what you just said, how does that piece behave on one concrete input?"
        if kind == "system_design":
            return "Building on that, which requirement would you lock next, and why?"
        if kind == "coding":
            return "What part of the problem do you want to tackle next?"
        if kind == "hr":
            return "What draws you to this role next?"
        if kind == "behavioral":
            return "What did you personally do next, and what changed because of it?"
        return "Tell me the next part of that, with one concrete detail."
    return opening_task({**payload, "plannedPrompt": ""})


def move_on(payload: dict, outcome: str) -> dict:
    bridge = "That makes sense." if outcome == "conceptual_pass" else "No problem at all."
    nxt = dynamic_next_prompt(payload)
    return {
        "sectionName": payload.get("section", ""),
        "prompt": short_spoken(f"{bridge} {nxt}"),
        "action": "advance",
        "hint": "",
        "clarifying": False,
        "outcome": outcome,
    }


def asks_for_meaning(answer: str) -> bool:
    text = re.sub(r"[^a-z\s]", " ", answer.lower())
    text = re.sub(r"\s+", " ", text)
    cues = (
        "what does",
        "what do you mean",
        "what that means",
        "what this means",
        "what it means",
        "what is it mean",
        "what is the meaning",
        "mean of",
        "meaning of",
        "can you explain",
        "could you explain",
        "explain me",
        "please explain",
        "elaborate",
        "dont understand",
        "do not understand",
        "didnt understand",
        "did not understand",
        "not understand",
        "i dont get",
        "what situation",
        "which situation",
        "what are you asking",
        "what question",
        "which question",
        "ask again",
        "repeat the question",
        "can you repeat",
    )
    return any(cue in text for cue in cues)


def quizzes_them(prompt: str) -> bool:
    text = prompt.lower()
    return any(cue in text for cue in (
        "what does",
        "what do you mean",
        "what is the meaning",
        "define ",
        "can you tell me what",
        "what is reliability",
    ))


def same_line(left: str, right: str) -> bool:
    def words(value: str) -> set[str]:
        return set(re.sub(r"[^a-z0-9 ]", " ", value.lower()).split())
    a = words(left)
    b = words(right)
    if not a or not b:
        return False
    return len(a & b) / min(len(a), len(b)) >= 0.72


INTERVIEWER_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "interviewer_turn",
        "strict": True,
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "action": {"type": "string", "enum": ["stay", "advance", "finish"]},
                "spoken_line": {"type": "string"},
                "internal_note": {"type": "string"},
                "hint": {"type": "string"},
            },
            "required": ["action", "spoken_line", "internal_note", "hint"],
        },
    },
}


def short_spoken(value: str) -> str:
    text = " ".join(value.split()).strip()
    parts = re.findall(r"[^.!?]+[.!?]+|[^.!?]+$", text)
    return " ".join(part.strip() for part in parts[:2]).strip()


def spoken_only(value: str) -> str:
    text = re.sub(r"</?(?:action|prompt|spoken_line|internal_note|hint)\b[^>]*>", " ", value, flags=re.I)
    text = re.sub(r"\s+", " ", text).strip().strip('"')
    lowered = text.lower()
    if (
        not text
        or text[0] in "{[<"
        or '"action"' in text
        or '"spoken_line"' in text
        or '"prompt"' in text
        or "<action" in lowered
        or "internal_note" in lowered
    ):
        return ""
    return text


def parse_interviewer(text: str) -> dict | None:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?|```$", "", cleaned, flags=re.M).strip()
    tagged = re.search(r"<spoken_line>(.*?)</spoken_line>", cleaned, re.S | re.I) or re.search(
        r"<prompt>(.*?)</prompt>", cleaned, re.S | re.I
    )
    if tagged:
        prompt = spoken_only(tagged.group(1))
        if prompt:
            action_tag = re.search(r"<action>\s*(stay|advance|finish)\s*</action>", cleaned, re.I)
            return {"action": action_tag.group(1).lower() if action_tag else "stay", "prompt": prompt, "hint": ""}
    found = re.search(r"\{.*\}", cleaned, re.S)
    if found:
        try:
            parsed = json.loads(found.group(0))
        except json.JSONDecodeError:
            parsed = None
        if isinstance(parsed, dict):
            prompt = spoken_only(str(parsed.get("spoken_line") or parsed.get("prompt") or ""))
            if prompt:
                action = parsed.get("action", "stay")
                if action not in ("stay", "advance", "finish"):
                    action = "stay"
                return {"action": action, "prompt": prompt, "hint": str(parsed.get("hint") or "")}
    for key in ("spoken_line", "prompt"):
        match = re.search(rf'"{key}"\s*:\s*"((?:\\.|[^"\\])*)"', cleaned)
        if not match:
            continue
        try:
            prompt = spoken_only(json.loads('"' + match.group(1) + '"'))
        except json.JSONDecodeError:
            prompt = ""
        if prompt:
            action_match = re.search(r'"action"\s*:\s*"(stay|advance|finish)"', cleaned)
            return {"action": action_match.group(1) if action_match else "stay", "prompt": prompt, "hint": ""}
    return None


def fallback_line(payload: dict) -> dict:
    kind = str(payload.get("interviewType") or "technical")
    section = str(payload.get("section") or "")
    answer = str(payload.get("answer") or "").strip()
    if kind == "technical":
        stay = "How does that part work on one concrete input, and what is the cost of that choice?"
        if section == "Background":
            stay = "How did data move through that system, and why that shape instead of a simpler one?"
        elif section == "Follow-ups":
            stay = "How would you meet that requirement if one dependency failed?"
        return {"action": "stay", "prompt": stay, "hint": ""}
    if kind == "system_design":
        return {"action": "stay", "prompt": "Which component breaks first if traffic jumps ten times, and how do you protect it?", "hint": ""}
    if kind == "coding":
        return {"action": "stay", "prompt": "Tell me the part of the problem you want clarified. The problem and your code stay as they are.", "hint": ""}
    if kind == "hr":
        return {"action": "stay", "prompt": "What specific part of this role are you most excited to own?", "hint": ""}
    if kind == "behavioral":
        detail = "that" if len(answer.split()) < 8 else "what you just described"
        return {
            "action": "stay",
            "prompt": f"In {detail}, what did you personally do, and what measurable result followed?",
            "hint": "",
        }
    return {
        "action": "stay",
        "prompt": "Take one concrete detail from what you just said and go one level deeper.",
        "hint": "",
    }


def clean_asked(value: str) -> str:
    text = value.strip()
    if not text.startswith("{") and "<action" not in text.lower() and '"prompt"' not in text and '"spoken_line"' not in text:
        return value
    parsed = parse_interviewer(text)
    if parsed:
        return parsed["prompt"]
    return "Walk me through one system from your work and how it behaves."


def greeting_for(answer: str) -> str:
    text = answer.lower()
    if "good evening" in text:
        return "Good evening"
    if "good afternoon" in text:
        return "Good afternoon"
    if re.search(r"good morn", text):
        return "Good morning"
    return "Hello"


def introduced_name(answer: str) -> str:
    match = re.search(r"\b(?:i am|i'm|im|my name is)\s+([A-Za-z][A-Za-z'-]{1,30})", answer, re.I)
    if not match:
        return ""
    name = match.group(1)
    blocked = {
        "a", "an", "the", "here", "ready", "good", "doing", "fine", "not", "name", "one", "high",
        "applying", "joined", "joining", "this", "that", "very", "also", "just", "from", "with",
    }
    if name.lower() in blocked:
        return ""
    return name[:1].upper() + name[1:]


def looks_like_intro(answer: str) -> bool:
    return bool(re.search(r"\b(hi+|hello|hey|good morn|good afternoon|good evening|i am|i'm|im|my name)\b", answer, re.I))


def looks_like_content(answer: str) -> bool:
    text = answer.strip()
    if len(text.split()) >= 16:
        return True
    return bool(re.search(
        r"\b(built|build|building|project|system|api|database|service|framework|rag|langchain|deploy|microservice|backend|frontend)\b",
        text,
        re.I,
    ))


def opening_task(payload: dict) -> str:
    """Fresh opening line for the round type. Seeds are hints only — never recited."""
    kind = str(payload.get("interviewType") or "technical")
    role = str(payload.get("role") or "this role").strip() or "this role"
    company = str(payload.get("company") or "").strip()
    where = f" at {company}" if company else ""
    resume = str(payload.get("resume") or "").strip()
    if kind == "coding":
        return "The problem stays on the left, so type a doubt or start writing when you are ready."
    if kind == "technical":
        if resume:
            return f"From your resume for {role}{where}, pick one system and explain how data moved through it, and why that shape."
        return f"For {role}{where}, name one system you built and how data moved through it end to end."
    if kind == "system_design":
        return f"Let's design one system for {role}{where}. Start with the requirements you would insist on."
    if kind == "hr":
        return f"What drew you to {role}{where}, and what do you want to own in the first six months?"
    if kind == "mixed":
        return f"Start with one system or project from your {role} work{where}. What was your part, and how did it work?"
    if kind == "behavioral":
        return f"For {role}{where}, tell me about a recent challenge you handled. What did you do, and what changed?"
    return f"For {role}{where}, walk me through one concrete piece of work you owned recently."


def introduction_reply(payload: dict) -> dict | None:
    # Only the pre-plan greeting uses this. Plan sections named "Introduction" must use the live model.
    if str(payload.get("phase") or "") != "greeting":
        return None
    answer = str(payload.get("answer") or "").strip()
    try:
        probes = int(payload.get("probes") or 0)
    except (TypeError, ValueError):
        probes = 0
    name = introduced_name(answer)
    hello = greeting_for(answer)
    role = str(payload.get("role") or "").strip()
    company = str(payload.get("company") or "").strip()
    seat = f" for the {role} interview at {company}" if role and company else f" for the {role} interview" if role else " for this interview"
    mine = f"{hello} {name}, I'm your interviewer{seat}, and it's nice to meet you." if name else f"{hello}. I'm your interviewer{seat}, and it's nice to meet you."
    nxt = opening_task(payload)
    content = looks_like_content(answer)
    if probes >= 1 or content:
        thanks = f"Thanks{(' ' + name) if name else ''}."
        return {
            "sectionName": "Introduction",
            "prompt": short_spoken(f"{thanks} {nxt}"),
            "action": "advance",
            "hint": "",
            "clarifying": False,
        }
    if not looks_like_intro(answer):
        return {
            "sectionName": "Introduction",
            "prompt": "Go ahead and start. Say hello, and tell me your name.",
            "action": "stay",
            "hint": "",
            "clarifying": False,
        }
    if not name:
        return {
            "sectionName": "Introduction",
            "prompt": f"{mine} What's your name?",
            "action": "stay",
            "hint": "",
            "clarifying": False,
        }
    return {
        "sectionName": "Introduction",
        "prompt": short_spoken(f"{mine} {nxt}"),
        "action": "advance",
        "hint": "",
        "clarifying": False,
    }


def seed_next_question(payload: dict) -> dict:
    """Background personalization of the next section question from the last answer."""
    planned = short_spoken(str(payload.get("plannedPrompt") or ""))
    kind = str(payload.get("interviewType") or "technical")
    section = str(payload.get("section") or "Next")
    if kind in {"technical", "coding", "system_design"} and behavioral_prompt(planned):
        planned = opening_task({**payload, "plannedPrompt": ""})
    load_local_env()
    key = os.environ.get("PRACTICE_ROOM_LLM_KEY", "").strip()
    if not key:
        return {"sectionName": section, "prompt": planned or opening_task(payload), "action": "advance", "hint": "", "clarifying": False}
    base = os.environ.get("PRACTICE_ROOM_LLM_BASE", "https://api.openai.com/v1").rstrip("/")
    model = question_model_name(base, os.environ.get("PRACTICE_ROOM_LLM_MODEL", "gpt-4o-mini"))
    brief = {
        "interviewType": kind,
        "section": section,
        "seed": planned[:400],
        "answer": str(payload.get("answer") or "")[:500],
        "priorAnswer": str(payload.get("priorAnswer") or "")[:300],
        "resume": str(payload.get("resume") or "")[:300],
        "jobDescription": str(payload.get("jobDescription") or "")[:200],
        "role": payload.get("role") or "",
        "company": payload.get("company") or "",
        "skills": payload.get("skills") or [],
    }
    body = {
        "model": model,
        "temperature": 0.5,
        "max_tokens": 90,
        "messages": [
            {
                "role": "system",
                "content": (
                    "Author the next spoken interview question for this section. Return JSON only: "
                    '{"spoken_line":"","action":"advance","internal_note":"","hint":""}. '
                    "spoken_line is one or two short sentences that react to their last answer. "
                    "seed is a private topic hint — never recite it. "
                    "Stay strictly on interviewType. "
                    "Technical/coding/system_design: mechanisms, data flow, fundamentals, costs — never STAR, disagreement, team-culture, or looking-back questions. "
                    "Behavioral: one situation, personal action, measurable result — still rewrite from their words."
                ),
            },
            {"role": "user", "content": json.dumps(brief)},
        ],
    }
    if "groq.com" in base:
        body["response_format"] = INTERVIEWER_SCHEMA
    request = urllib.request.Request(
        f"{base}/chat/completions",
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json", "User-Agent": BROWSER},
    )
    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            data = json.loads(response.read().decode())
        parsed = parse_interviewer(reply_text(data["choices"][0]["message"]))
        prompt = spoken_only(str((parsed or {}).get("prompt") or ""))
        if not prompt or (kind in {"technical", "coding", "system_design"} and behavioral_prompt(prompt)):
            prompt = planned or opening_task(payload)
        return {"sectionName": section, "prompt": short_spoken(prompt), "action": "advance", "hint": "", "clarifying": False}
    except (TimeoutError, urllib.error.URLError, urllib.error.HTTPError, KeyError, IndexError, TypeError, json.JSONDecodeError):
        return {"sectionName": section, "prompt": planned or opening_task(payload), "action": "advance", "hint": "", "clarifying": False}


def prepared_question(payload: dict) -> str:
    """Private seed only when it is type-safe. Callers must not speak this verbatim."""
    if payload.get("interviewType") == "coding" and str(payload.get("section") or "") != "Introduction":
        return ""
    planned = str(payload.get("plannedPrompt") or "").strip()
    if not planned or planned.lower().startswith("problem statement"):
        return ""
    kind = str(payload.get("interviewType") or "")
    if kind in {"technical", "coding", "system_design"} and behavioral_prompt(planned):
        return ""
    asked = str(payload.get("asked") or "")
    if asked and same_line(planned, asked):
        return ""
    return planned


def quick_reply(payload: dict) -> dict:
    """Emergency path when the live model is unavailable — still interactive, never scripted."""
    line = fallback_line(payload)
    return {
        "sectionName": payload.get("section", ""),
        "prompt": short_spoken(str(line["prompt"])),
        "action": str(line["action"]),
        "hint": "",
        "clarifying": False,
    }


def model_reply(payload: dict) -> dict:
    if str(payload.get("phase") or "") == "seed_next":
        return seed_next_question(payload)
    intro = introduction_reply(payload)
    if intro:
        return intro
    load_local_env()
    key = os.environ.get("PRACTICE_ROOM_LLM_KEY", "").strip()
    if not key:
        raise RuntimeError("Set PRACTICE_ROOM_LLM_KEY so the interviewer can respond to the answer.")
    base = os.environ.get("PRACTICE_ROOM_LLM_BASE", "https://api.openai.com/v1").rstrip("/")
    configured = os.environ.get("PRACTICE_ROOM_LLM_MODEL", "gpt-4o-mini")
    model = live_model_name(base, configured)
    answer = str(payload.get("answer") or "")
    explaining = asks_for_meaning(answer)
    outcome = "" if explaining else turn_outcome(answer)
    if outcome and not payload.get("forceStayInSection"):
        return move_on(payload, outcome)
    payload = {**payload, "asked": clean_asked(str(payload.get("asked") or ""))[:500]}
    kind = str(payload.get("interviewType") or "technical")
    topic_hint = str(payload.get("plannedPrompt") or "")[:400]
    next_hint = str(payload.get("nextSeed") or "")[:400]
    if kind in {"technical", "coding", "system_design"}:
        if behavioral_prompt(topic_hint):
            topic_hint = ""
        if behavioral_prompt(next_hint):
            next_hint = ""
    brief = {
        "section": payload.get("section") or "",
        "nextSection": payload.get("nextSection") or "",
        "asked": payload["asked"],
        "answer": answer[:800],
        "topicHint": topic_hint,
        "nextHint": next_hint,
        "probeNote": str(payload.get("probeNote") or "")[:180],
        "priorAnswer": str(payload.get("priorAnswer") or "")[:400],
        "probes": payload.get("probes") or 0,
        "allowStay": payload.get("allowStay", True),
        "forceStayInSection": bool(payload.get("forceStayInSection")),
        "interviewType": kind,
        "company": payload.get("company") or "",
        "role": payload.get("role") or "",
        "skills": payload.get("skills") or [],
        "experienceLevel": payload.get("experienceLevel") or "",
        "difficulty": payload.get("difficulty") or "",
        "persona": payload.get("persona") or "",
        "practiceMode": payload.get("practiceMode") or "",
        "resume": str(payload.get("resume") or "")[:400],
        "jobDescription": str(payload.get("jobDescription") or "")[:240],
        "codeResult": str(payload.get("codeResult") or "")[:500],
        "rule": "Author spoken_line from their answer. topicHint/nextHint are private. Never recite canned STAR scripts.",
    }
    request_body = {
        "model": model,
        "temperature": 0.4,
        "max_tokens": 120,
        "messages": [
            {"role": "system", "content": EXPLAINER if explaining else INTERVIEWER_LIVE},
            {"role": "user", "content": json.dumps(brief)},
        ],
    }
    if "groq.com" in base and "gpt-oss" in model:
        request_body["reasoning_effort"] = "low"
        request_body["max_tokens"] = 400
    if "openrouter.ai" in base:
        request_body["provider"] = {"sort": "latency"}
        request_body["reasoning"] = {"enabled": False}
    use_schema = "groq.com" in base
    data = None
    for attempt in range(2):
        attempt_body = dict(request_body)
        if use_schema:
            attempt_body["response_format"] = INTERVIEWER_SCHEMA
        request = urllib.request.Request(
            f"{base}/chat/completions",
            data=json.dumps(attempt_body).encode(),
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json", "User-Agent": BROWSER},
        )
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                data = json.loads(response.read().decode())
            break
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", "replace")[:400]
            if error.code == 400 and use_schema and ("json_schema" in detail or "response_format" in detail):
                use_schema = False
                continue
            if attempt == 0 and error.code in (400, 404):
                request_body["model"] = "llama-3.1-8b-instant"
                request_body.pop("reasoning_effort", None)
                request_body["max_tokens"] = 120
                continue
            return quick_reply(payload)
        except (TimeoutError, urllib.error.URLError):
            return quick_reply(payload)
    if data is None:
        return quick_reply(payload)
    message = data["choices"][0]["message"]
    text = reply_text(message)
    parsed = parse_interviewer(text)
    if parsed is None:
        for part in (message.get("reasoning"), message.get("reasoning_content"), message.get("content")):
            if part and str(part).strip() and str(part).strip() != text:
                parsed = parse_interviewer(str(part))
                if parsed:
                    break
    if parsed is None:
        if not text:
            return quick_reply(payload)
        parsed = fallback_line(payload)
    action = parsed.get("action", "stay")
    if action not in ("stay", "advance", "finish"):
        action = "stay"
    prompt = spoken_only(str(parsed.get("prompt", "")).strip())
    if not prompt:
        prompt = fallback_line(payload)["prompt"]
        action = "stay"
    asked = str(payload.get("asked") or "")
    if explaining:
        action = "stay"
        if len(prompt.split()) < 12 or "two spoken" in prompt.lower() or quizzes_them(prompt) or (asked and same_line(prompt, asked)):
            heard = f"{payload.get('answer') or ''} {payload.get('priorAnswer') or ''} {asked}".lower()
            if "situation" in heard or "asking" in heard or "question" in heard:
                prompt = (
                    "Sorry — let me rephrase. I want one concrete piece of work from you: "
                    "what you built or owned, and how it worked. What is that piece?"
                )
            elif "reliab" in heard:
                prompt = (
                    "Reliability means the service still works when a payment fails or a time slot is already taken. "
                    "In the service you described, what failed, or what were you worried would fail?"
                )
            else:
                prompt = (
                    "I'll say that in plain words. It is the ordinary idea behind the question, not a term you have to define. "
                    "Using what you already told me, go one step deeper."
                )
    elif asked and same_line(prompt, asked):
        if payload.get("forceStayInSection"):
            action = "stay"
            prompt = fallback_line(payload)["prompt"]
        else:
            action = "advance"
            prompt = dynamic_next_prompt(payload)
    hint = "" if payload.get("practiceMode") != "coach" else str(parsed.get("hint", "")).strip()
    try:
        probes = int(payload.get("probes") or 0)
    except (TypeError, ValueError):
        probes = 0
    if payload.get("forceStayInSection"):
        action = "stay"
    elif probes >= 2 and action == "stay" and kind != "coding":
        action = "advance"
        prompt = dynamic_next_prompt(payload)
    if kind == "coding" and action == "advance" and str(payload.get("section") or "") not in {"Introduction", "Greeting"}:
        text = str(payload.get("answer") or "").lower()
        done_asking = any(cue in text for cue in ("next question", "i am done", "i'm done", "that's all", "move on"))
        if not done_asking:
            action = "stay"
            if not prompt or (asked and same_line(prompt, asked)):
                prompt = "Tell me the part of the problem you want clarified. The problem and your code stay as they are."
    if kind in {"technical", "coding", "system_design"} and behavioral_prompt(prompt):
        prompt = fallback_line(payload)["prompt"] if action == "stay" else opening_task({**payload, "plannedPrompt": ""})
    if action == "advance" and (
        not prompt
        or same_line(prompt, asked)
        or (kind in {"technical", "coding", "system_design"} and behavioral_prompt(prompt))
    ):
        prompt = dynamic_next_prompt(payload)
    # Never let a scripted seed leak into the spoken line.
    seed = str(payload.get("plannedPrompt") or "")
    if seed and same_line(prompt, seed):
        prompt = fallback_line(payload)["prompt"] if action == "stay" else dynamic_next_prompt(payload)
    return {
        "sectionName": payload.get("section", ""),
        "prompt": short_spoken(prompt),
        "action": action,
        "hint": hint,
        "clarifying": explaining,
    }


@mcp.tool()
def ask_next(
    section: str,
    answer: str = "",
    plannedPrompt: str = "",
    resume: str = "",
    phase: str = "",
    interviewType: str = "",
    asked: str = "",
    codeResult: str = "",
    signals: dict | None = None,
    jobDescription: str = "",
    persona: str = "recruiter",
    practiceMode: str = "real",
    rubric: str = "",
    probes: int = 0,
) -> dict:
    """Say the next live line from the candidate's answer."""
    return model_reply({
        "section": section,
        "answer": answer,
        "asked": asked,
        "plannedPrompt": plannedPrompt,
        "resume": resume,
        "jobDescription": jobDescription,
        "persona": persona,
        "practiceMode": practiceMode,
        "rubric": rubric,
        "probes": probes,
        "phase": phase,
        "interviewType": interviewType,
        "codeResult": codeResult,
        "signals": signals or {},
    })


SCORER = """Score this one practice interview from its transcript only. The reply is one JSON object with the fields in the schema.
Content scores are 0 to 100. Question scores are 1 to 5. Score only this transcript against the rubric in the user message.
content names to use:
Ownership: did they name their own decision or action, or only a team summary? Quote them.
Quantified impact: did they name a concrete outcome, a number, a latency change, or a tradeoff? Quote it. If they named none, score 0.
STAR completeness: include this only for a behavioral or HR interview, or when the question asked for a past situation. Score how many of situation, task, action, and result are present, scaled to 0-100. Quote the piece that is present.
Follow-up resilience: action stay means they needed a probe. action advance means they answered the core question on that turn. When they were probed, quote the deeper reason in the later answer.
Code: include this only when the answer contains code or a console result. Judge whether the console was clean, whether an error was reported, and whether their spoken explanation matches the code. Do not invent a test they did not run.
JD alignment: quote the part of the answer that matches the role. If none does, score 0.
Every content detail must quote words the candidate said or a line of their code. If you cannot quote it, set the score to 0 and needsWork to true.
questions has one row per answered transcript row, in order. worked is what they did well. missing is the piece the answer still lacks. Both must use their words.
idealAnswer rewrites the weakest answer using only facts from the transcript and the resume. Do not invent a company, a number, or a tool.
focus is exactly three drills for the next session, each one a concrete sentence they can practice.
Do not score pace, fillers, thinking time, accent, appearance, or emotion. Those numbers are already measured. Do not recommend a hire. A polite opt-out, where they say they do not remember or will brush up, is not a weak answer. Do not lower a score for that honesty."""


REPORT_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "interview_report",
        "strict": True,
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "overallScore": {"type": "integer"},
                "criteria": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "name": {"type": "string", "enum": ["technical_accuracy", "problem_solving", "communication_clarity", "answer_relevance", "completeness"]},
                            "score": {"type": "integer"},
                            "evidence": {"type": "string"},
                            "explanation": {"type": "string"},
                            "confidence": {"type": "string", "enum": ["low", "high"]},
                        },
                        "required": ["name", "score", "evidence", "explanation", "confidence"],
                    },
                },
                "content": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "name": {"type": "string", "enum": ["Ownership", "Quantified impact", "STAR completeness", "Follow-up resilience", "Code", "JD alignment"]},
                            "score": {"type": "integer"},
                            "detail": {"type": "string"},
                            "needsWork": {"type": "boolean"},
                        },
                        "required": ["name", "score", "detail", "needsWork"],
                    },
                },
                "questions": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "prompt": {"type": "string"},
                            "score": {"type": "integer"},
                            "worked": {"type": "string"},
                            "missing": {"type": "string"},
                        },
                        "required": ["prompt", "score", "worked", "missing"],
                    },
                },
                "idealAnswer": {"type": "string"},
                "focus": {"type": "array", "items": {"type": "string"}},
                "strengths": {"type": "array", "items": {"type": "string"}},
                "improvements": {"type": "array", "items": {"type": "string"}},
                "practiceTopics": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["overallScore", "criteria", "content", "questions", "idealAnswer", "focus", "strengths", "improvements", "practiceTopics"],
        },
    },
}


def length_report(transcript: list[dict]) -> dict:
    answered = [row for row in transcript if row.get("answer", "").strip()]
    short = [row for row in answered if len(row["answer"]) < 40]
    long = [row for row in answered if len(row["answer"]) >= 40]
    mostly_short = len(short) > len(long)
    score = 40 if mostly_short else 80
    evidence = (short or long)[0]["answer"].strip()
    confidence = "low" if mostly_short else "high"
    names = [
        "technical_accuracy",
        "problem_solving",
        "communication_clarity",
        "answer_relevance",
        "completeness",
    ]
    return {
        "overallScore": score,
        "criteria": [
            {
                "name": name,
                "score": score,
                "evidence": evidence,
                "explanation": (
                    f"{name} has limited support because the answer is too short to judge."
                    if mostly_short
                    else f"{name} is supported by a developed answer."
                ),
                "confidence": confidence,
            }
            for name in names
        ],
        "strengths": [f"Developed answer in {row['sectionName']}." for row in long],
        "improvements": [f"Expand the answer in {row['sectionName']}." for row in short],
        "practiceTopics": [row["sectionName"] for row in short],
    }


def figure(name: str, score: int, detail: str, needs_work: bool) -> dict:
    return {"name": name, "score": max(0, min(100, int(score))), "detail": detail, "needsWork": needs_work}


def measured_figures(transcript: list[dict]) -> tuple[list[dict], list[dict]]:
    rows = [row for row in transcript if isinstance(row.get("delivery"), dict)]
    if not rows:
        return [], []
    words = sum(int(row["delivery"].get("words") or 0) for row in rows)
    elapsed = sum(int(row["delivery"].get("elapsedMs") or 0) for row in rows)
    fillers = sum(int(row["delivery"].get("fillers") or 0) for row in rows)
    latency = [int(row["delivery"].get("latencyMs") or 0) for row in rows if int(row["delivery"].get("latencyMs") or 0) > 0]
    hidden = sum(int(row["delivery"].get("tabHidden") or 0) for row in rows)
    faces = [row["delivery"].get("faces") for row in rows if row["delivery"].get("faces") is not None]
    spoken = 0
    for row in rows:
        elapsed_row = int(row["delivery"].get("elapsedMs") or 0)
        latency_row = int(row["delivery"].get("latencyMs") or 0)
        spoken += elapsed_row - latency_row if latency_row and elapsed_row > latency_row else elapsed_row
    minutes = spoken / 60000 if spoken else 0
    wpm = round(words / minutes) if minutes else 0
    per_hundred = round(fillers / words * 100, 1) if words else 0
    pace = 100 if 120 <= wpm <= 150 else max(0, 100 - int(abs(wpm - 135) * 1.5))
    filler_score = max(0, 100 - int(per_hundred * 8))
    think = round(sum(latency) / len(latency) / 1000, 1) if latency else 0
    think_score = 100 if 1.5 <= think <= 4 else max(0, 100 - int(abs(think - 2.75) * 12))
    seconds = round(elapsed / len(rows) / 1000) if rows else 0
    length_score = 100 if 45 <= seconds <= 120 else max(0, 100 - int(abs(seconds - 80) / 2))
    away = round(sum(int(row["delivery"].get("tabAwayMs") or 0) for row in rows) / 1000)
    delivery = [
        figure("Speaking pace", pace, f"{wpm} words per minute. A steady pace is 120 to 150.", wpm < 105 or wpm > 165),
        figure("Filler words", filler_score, f"{fillers} fillers, {per_hundred} per 100 words.", per_hundred > 4),
        figure("Thinking time", think_score, f"{think} seconds after the question before the answer started. A composed start is 1.5 to 4 seconds.", think < 1.5 or think > 8),
        figure("Answer length", length_score, f"About {seconds} seconds per answer. Under 20 seconds is thin, and over 150 seconds is hard to follow.", seconds < 20 or seconds > 150),
    ]
    presence = [
        figure("Tab focus", max(0, 100 - hidden * 25), f"The interview tab was hidden {hidden} times, for about {away} seconds.", hidden > 0),
    ]
    if faces:
        centered = sum(1 for count in faces if count == 1)
        percent = round(100 * centered / len(faces))
        presence.append(figure("In frame", percent, f"One face was visible on {percent}% of answers.", percent < 70))
    return delivery, presence


def as_figures(rows: object) -> list[dict]:
    if not isinstance(rows, list):
        return []
    figures = []
    for row in rows:
        if not isinstance(row, dict) or not row.get("name"):
            continue
        figures.append(figure(str(row["name"]), int(row.get("score") or 0), str(row.get("detail") or ""), bool(row.get("needsWork"))))
    return figures


def score_with_model(transcript: list[dict], rubric: str, interview_type: str = "", job_description: str = "", resume: str = "") -> dict:
    load_local_env()
    key = os.environ.get("PRACTICE_ROOM_LLM_KEY", "").strip()
    if not key:
        return length_report(transcript)
    base = os.environ.get("PRACTICE_ROOM_LLM_BASE", "https://api.openai.com/v1").rstrip("/")
    model = os.environ.get("PRACTICE_ROOM_LLM_MODEL", "gpt-4o-mini")
    request_body = {
        "model": model,
        "temperature": 0.2,
        "max_tokens": 2000,
        "messages": [
            {"role": "system", "content": SCORER},
            {"role": "user", "content": json.dumps({
                "rubric": rubric,
                "interviewType": interview_type,
                "jobDescription": job_description,
                "resume": resume,
                "transcript": transcript,
            })},
        ],
    }
    if "groq.com" in base:
        request_body["reasoning_effort"] = "low"
    use_schema = "groq.com" in base
    data = None
    for attempt in range(2):
        attempt_body = dict(request_body)
        if use_schema:
            attempt_body["response_format"] = REPORT_SCHEMA
        request = urllib.request.Request(
            f"{base}/chat/completions",
            data=json.dumps(attempt_body).encode(),
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json", "User-Agent": BROWSER},
        )
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                data = json.loads(response.read().decode())
            break
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", "replace")[:400]
            if error.code == 400 and use_schema and ("json_schema" in detail or "response_format" in detail):
                use_schema = False
                continue
            raise
    if data is None:
        raise RuntimeError("The model returned an empty reply.")
    text = reply_text(data["choices"][0]["message"])
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?|```$", "", text, flags=re.M).strip()
    found = re.search(r"\{.*\}", text, re.S)
    parsed = json.loads(found.group(0) if found else text)
    names = [
        "technical_accuracy",
        "problem_solving",
        "communication_clarity",
        "answer_relevance",
        "completeness",
    ]
    criteria = []
    for name in names:
        match = next((row for row in parsed.get("criteria", []) if row.get("name") == name), None)
        score = int(match.get("score", 0)) if match else 0
        criteria.append({
            "name": name,
            "score": max(0, min(100, score)),
            "evidence": str(match.get("evidence", "") if match else "")[:400],
            "explanation": str(match.get("explanation", "") if match else ""),
            "confidence": "high" if match and match.get("confidence") == "high" else "low",
        })
    questions = []
    for row in parsed.get("questions") or []:
        if isinstance(row, dict) and row.get("prompt"):
            worked = str(row.get("worked") or "")
            missing = str(row.get("missing") or "")
            questions.append({
                "prompt": str(row["prompt"])[:240],
                "score": max(1, min(5, int(row.get("score") or 1))),
                "note": " ".join(part for part in (worked, missing, str(row.get("note") or "")) if part).strip(),
                "worked": worked,
                "missing": missing,
            })
    return {
        "overallScore": max(0, min(100, int(parsed.get("overallScore", 0)))),
        "criteria": criteria,
        "content": as_figures(parsed.get("content")),
        "questions": questions[:8],
        "idealAnswer": str(parsed.get("idealAnswer") or ""),
        "focus": [str(item) for item in parsed.get("focus") or []][:3],
        "strengths": [str(item) for item in parsed.get("strengths", [])][:4],
        "improvements": [str(item) for item in parsed.get("improvements", [])][:4],
        "practiceTopics": [str(item) for item in parsed.get("practiceTopics", [])][:4],
    }


def with_measured(report: dict, transcript: list[dict]) -> dict:
    delivery, presence = measured_figures(transcript)
    report["delivery"] = delivery
    report["presence"] = presence
    return report


@mcp.tool()
def write_report(transcript: list[dict], rubric: str = "", interviewType: str = "", jobDescription: str = "", resume: str = "") -> dict:
    """Score this interview on its own transcript."""
    if rubric:
        try:
            report = score_with_model(transcript, rubric, interviewType, jobDescription, resume)
        except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError):
            report = length_report(transcript)
    else:
        report = length_report(transcript)
    return with_measured(report, transcript)



if __name__ == "__main__":
    mcp.run()
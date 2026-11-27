import csv
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
        return f"From your own work, how does this actually behave? {line}"
    return line


def typed_question(topic: str, section: str, interview_type: str, index: int) -> str:
    role = topic or "this role"
    by_type = {
        "behavioral": (
            f"Tell me about a time you disagreed with someone while working as a {role}. What did you do?",
            f"Tell me about a time something you owned in {section.lower()} went wrong. What was the result?",
            "Looking back at that situation, what would you do differently?",
        ),
        "coding": (
            f"Write a {role} function this role would use. State the arguments, the return value, one constraint, and one example whose output you have checked.",
            f"Write that {role} function, then name one choice you made.",
            "What is the time cost and the space cost of the function you just wrote?",
        ),
        "technical": (
            f"Which idea in {section.lower()} has been hardest in your work as a {role}?",
            "Explain that idea with one example from a system you worked on.",
            "Where does that approach fail, and why did you keep it?",
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
            f"Tell me about a time you owned a hard problem as a {role}.",
            "Walk me through one technical choice in that work.",
            "What was the result, and what would you change?",
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
                "behavioral": "What did you do, and what was the result?",
                "coding": "Why that choice, and what does it cost in time?",
                "system_design": "What did you trade off, and why?",
                "hr": "Why does that matter for this role?",
            }.get(interview_type, "Give one example from your own work."),
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
        "behavioral": "What did you do, and what was the result?",
        "coding": "Why that choice, and what does it cost in time?",
        "technical": "Give one example from your own work.",
        "system_design": "What did you trade off, and why?",
        "hr": "Why does that matter for this role?",
        "mixed": "Add one concrete example.",
    }.get(interviewType, "Give one example from your own work.")
    if reported:
        return [
            {
                "sectionName": section,
                "prompt": prompt_for_type(question_line(reported[index], interviewType), interviewType) if index < len(reported) else typed_question(topic, section, interviewType, index),
                "followUpPrompt": follow,
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
            "followUpPrompt": follow,
        }
        for index, section in enumerate(sections)
    ]


PREPARE = """You write the questions for one practice interview. Return JSON only:
{"questions":[{"sectionName":"","prompt":"","followUpPrompt":""}]}
The user JSON is the form filled in before the interview. Use company, role, skills, experienceLevel, difficulty, interviewType, description, resume, materials, and sources. Ignore nothing that was filled in. sections lists the section names in order. Copy each sectionName exactly. One question per section.
A different skill, role, or company must produce a different question. Do not reuse a string-window puzzle, a generic "walk me through a coding problem", or "tell me about a project you owned" unless interviewType is behavioral or hr.
Be technically correct for that skill and level. Do not invent a language rule. Do not state an example output you have not computed by hand. Entry level is one clear mechanism. Mid level asks for a tradeoff. Senior adds one failure mode or an incomplete requirement.
Coding, first prompt, use these labels and real line breaks, and name the language from skills or the role:
Problem statement
Write a function in that language. Name the arguments, their types, and the return value. The task must be something that role or those skills actually involve.
Constraints
- one real bound
- one real bound
Example
Input: a tiny input
Output: the correct result of that input
The later coding prompts stay on that same function: ask them to write it, then ask for its time cost and space cost.
Technical: name one real mechanism of the skill and ask how it behaves, including one limit.
System design: requirements, then the design, then one option they would reject, in the role's domain.
Behavioral and HR: a past situation, the action they took, and a result that can be checked.
followUpPrompt is one deeper question about the same prompt. Do not copy an online-judge statement."""


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
    if requirement and requirement.lower() not in spoken.lower():
        spoken = f"The role needs this: {requirement}. {spoken}"
    elif skills and interview_type != "hr" and skills[0].lower() not in spoken.lower():
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
    if closer and closer.lower() not in spoken.lower():
        spoken = f"{spoken} {closer}"
    if index == 0 and str(payload.get("resume") or "").strip():
        spoken = f"{spoken} You can use a project from your resume."
    if persona == "bar_raiser" and index == 0 and "who owned" not in spoken.lower():
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
    terms: list[str] = []
    for skill in payload.get("skills") or []:
        text = str(skill).strip().lower()
        if text:
            terms.append(text)
    for key in ("company", "role", "topic"):
        text = str(payload.get(key) or "").strip().lower()
        if text:
            terms.append(text)
    description = str(payload.get("description") or "")
    for word in re.findall(r"[A-Za-z][A-Za-z+#.]{4,}", description):
        terms.append(word.lower())
    seen: list[str] = []
    for term in terms:
        if term not in seen:
            seen.append(term)
    return seen


def questions_match_form(payload: dict, questions: list[dict]) -> bool:
    sections = [str(section) for section in payload.get("sections") or []]
    if len(questions) != len(sections) or not sections:
        return False
    interview_type = str(payload.get("interviewType") or "")
    blob = " ".join(str(question.get("prompt") or "") for question in questions).lower()
    if "firstuniquewindow" in blob.replace(" ", ""):
        return False
    if "walk me through how you would solve a coding problem" in blob:
        return False
    terms = interview_terms(payload)
    if terms and not any(term in blob for term in terms):
        return False
    for index, section in enumerate(sections):
        prompt = str(questions[index].get("prompt") or "").strip()
        if questions[index].get("sectionName") != section or len(prompt.split()) < 12:
            return False
        if interview_type == "coding" and index == 0:
            lowered = prompt.lower()
            if not all(part in lowered for part in ("problem statement", "constraints", "input:", "output:")):
                return False
    return True


def questions_from_model(payload: dict, redo: bool = False) -> list[dict]:
    load_local_env()
    key = os.environ.get("PRACTICE_ROOM_LLM_KEY", "").strip()
    if not key:
        raise RuntimeError("Set PRACTICE_ROOM_LLM_KEY so the interview can be prepared.")
    base = os.environ.get("PRACTICE_ROOM_LLM_BASE", "https://api.openai.com/v1").rstrip("/")
    model = os.environ.get("PRACTICE_ROOM_LLM_MODEL", "gpt-4o-mini")
    note = " The previous draft ignored the form. Rewrite every question from the skills, role, company, and description in this JSON." if redo else ""
    request_body = {
        "model": model,
        "temperature": 0.7,
        "max_tokens": 2048,
        "messages": [
            {"role": "system", "content": PREPARE},
            {"role": "user", "content": json.dumps(payload) + note},
        ],
    }
    if "groq.com" in base:
        request_body["reasoning_effort"] = "low"
    use_schema = "groq.com" in base
    data = None
    for attempt in range(3):
        attempt_body = dict(request_body)
        if use_schema:
            attempt_body["response_format"] = QUESTION_SCHEMA
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
            if error.code not in (429, 503) or attempt == 2:
                raise RuntimeError(f"The model did not write the questions. {detail}") from error
        except TimeoutError:
            if attempt == 2:
                raise RuntimeError("The model is busy. Prepare the room again.")
        time.sleep(2)
    if data is None:
        raise RuntimeError("The model is busy. Prepare the room again.")
    text = reply_text(data["choices"][0]["message"])
    found = re.search(r"\{.*\}", text, re.S)
    parsed = json.loads(found.group(0) if found else text)
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


def prepare_questions(payload: dict) -> list[dict]:
    sources = list(payload.get("sources") or [])
    materials = " ".join(str(payload.get("materials") or "").split()).strip()
    if materials and not any(source.get("platform") == "supplied" for source in sources if isinstance(source, dict)):
        sources.append({"platform": "supplied", "excerpt": materials[:2000]})
        payload = {**payload, "sources": sources}
    sections = [str(section) for section in payload.get("sections") or []]
    questions = questions_from_model(payload)
    if len(questions) == len(sections):
        questions = [{**question, "sectionName": section} for question, section in zip(questions, sections)]
    if not questions_match_form(payload, questions):
        questions = questions_from_model(payload, redo=True)
        if len(questions) == len(sections):
            questions = [{**question, "sectionName": section} for question, section in zip(questions, sections)]
    if not questions_match_form(payload, questions):
        raise RuntimeError("The model did not use the company, role, and skills from the form. Prepare the room again.")
    return questions


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
spoken_line is one or two spoken sentences written from the candidate's latest answer.
Persona coach: warm, then the question. Persona recruiter: neutral and brief. Persona bar_raiser: ask for the number, who owned the work, and the tradeoff.
Practice mode coach: hint names the missing piece a stronger answer would include. Practice mode real: hint is "".
company, role, skills, experienceLevel, difficulty, description, resume, and interviewType are the form filled in before the interview. Stay on that company, that role, and those skills. Do not switch to a different technology. If the answer is technically wrong for that skill, name the mistake in one sentence and ask them to correct that part of this question. Do not replace a technical or coding question with a generic project introduction.
Opening: greet them for the role at the company, name the round in a few words, and ask the planned question.
If their answer asks what a word means, or asks you to explain or elaborate, action is stay. Sentence one explains that word in plain language. Sentence two asks the same idea without the jargon, using a detail from their earlier answer when there is one. You explain. You never ask them to define the word. You never repeat the question in "asked".
Opt-out rule, checked before any stay: if they clearly say they do not know, do not remember the exact syntax, have not used it, have not worked on it, or will brush up or work on it later, action is advance. Say "No problem at all" and ask the planned next question. Do not quiz them and do not set hint. Stay only when they attempted an answer and it is still unclear on this same part: what they owned, a number, an edge case, or how one component behaves. If the answer already covers that part, advance. Do not stay to open a new topic. If they do not remember a name but then explain how it works, credit that idea in one short sentence and advance.
Coding: stay only when the approach or one component is still unclear. At most two follow-ups, not a chain of inputs, then approach, then cost. When codeResult is present, one of those two may ask about one choice in the code. Do not grade it. Do not ask them to define big-O unless they used that wording. In coach mode, a hint is one nudge, not the solution.
If company is Google, a coding or technical follow-up tests how they frame constraints or whether the approach is correct. A behavioral follow-up asks what they personally owned, or how they handled something unclear. Do not recite rubric names.
If interviewType is behavioral or hr and the answer has no personal action or no result, stay and ask for that missing piece, using one detail they said. The new prompt must be different from the question in "asked".
Never ask the same question again. If your prompt would match "asked", choose advance.
The answer was spoken. A word may still be a mishearing of a term in the resume or the question, such as sequel for SQL or APS for API. Understand the intended word. Do not ask about a misheard word, a country, a wheel, or any detail they did not clearly name. Ask about a tool, a document, or a choice that is actually in the answer.
probes is how many follow-ups you already asked on this question. Two is the maximum, including a follow-up that explains a word. When probes is 2 or more, action is advance even if another detail would help.
When you advance, ask the planned next question in your own words and tie it to one thing they said.
On the last section, after they answer it, finish.
Match interviewType. Behavioral asks for a past situation, their action, and the result. Coding asks for an approach and a choice in the code. Technical asks how a concept behaved in their work. System design asks for a requirement and a tradeoff. HR asks why they want the role. Do not ask a coding or design question in a behavioral or HR interview.
Speech pace, filler words, a hidden browser tab, and how many faces the camera sees can change your reply. Do not score accent, appearance, or emotion. Mention the camera or the tab only to invite them back.
Do not recite a methodology article. Do not say "keep the focus on"."""


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
If they name a company, mode is job. If they name only a skill, mode is skill and company is empty. Use the round they asked for. Behavioral means interviewType behavioral. If they name a company and no round, and the role is engineering, interviewType is coding. role is Software Engineer when they name none. experienceLevel is entry for new grad or L3, senior for senior or L5 and above, otherwise mid. description states the company, role, level, and round. Do not invent a company. durationMinutes is from 15 to 30."""


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
    body = b"".join([
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"model\"\r\n\r\nwhisper-large-v3\r\n".encode(),
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
        with urllib.request.urlopen(request, timeout=45) as response:
            data = json.loads(response.read().decode())
        text = str(data.get("text") or "").strip()
        if not text:
            return {"text": "", "error": "Whisper returned no words for that recording."}
        return {"text": text, "error": ""}
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", "replace")[:180]
        return {"text": "", "error": detail or "Whisper refused the recording."}
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError) as error:
        return {"text": "", "error": str(error) or "Whisper could not transcribe the recording."}


def repair_spoken(payload: dict) -> str:
    original = str(payload.get("answer") or "").strip()
    if len(original.split()) < 8:
        return original
    load_local_env()
    key = os.environ.get("PRACTICE_ROOM_LLM_KEY", "").strip()
    if not key:
        return original
    base = os.environ.get("PRACTICE_ROOM_LLM_BASE", "https://api.openai.com/v1").rstrip("/")
    model = os.environ.get("PRACTICE_ROOM_LLM_MODEL", "gpt-4o-mini")
    body = json.dumps({
        "model": model,
        "temperature": 0,
        "max_tokens": 500,
        "reasoning": {"enabled": False},
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
        with urllib.request.urlopen(http, timeout=25) as response:
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


def move_on(payload: dict, outcome: str) -> dict:
    asked = str(payload.get("asked") or "")
    planned = str(payload.get("plannedPrompt") or "").strip()
    bridge = "That makes sense. Let's look at the next part." if outcome == "conceptual_pass" else "No problem at all. Let's move on."
    if planned and not same_line(planned, asked):
        return {
            "sectionName": payload.get("section", ""),
            "prompt": f"{bridge} {planned}",
            "action": "advance",
            "hint": "",
            "clarifying": False,
            "outcome": outcome,
        }
    return {
        "sectionName": payload.get("section", ""),
        "prompt": f"{bridge} We'll close here.",
        "action": "finish",
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
    asked = str(payload.get("asked") or "")
    planned = str(payload.get("plannedPrompt") or "")
    answer = str(payload.get("answer") or "").strip()
    if len(answer.split()) >= 25 and planned and not same_line(planned, asked):
        return {"action": "advance", "prompt": planned, "hint": ""}
    return {
        "action": "stay",
        "prompt": "What did you personally own in that project, and what changed because of your work?",
        "hint": "",
    }


def clean_asked(value: str) -> str:
    text = value.strip()
    if not text.startswith("{") and "<action" not in text.lower() and '"prompt"' not in text and '"spoken_line"' not in text:
        return value
    parsed = parse_interviewer(text)
    if parsed:
        return parsed["prompt"]
    return "Tell me about a project you owned, and what your part in it was."


def model_reply(payload: dict) -> dict:
    load_local_env()
    key = os.environ.get("PRACTICE_ROOM_LLM_KEY", "").strip()
    if not key:
        raise RuntimeError("Set PRACTICE_ROOM_LLM_KEY so the interviewer can respond to the answer.")
    base = os.environ.get("PRACTICE_ROOM_LLM_BASE", "https://api.openai.com/v1").rstrip("/")
    model = os.environ.get("PRACTICE_ROOM_LLM_MODEL", "gpt-4o-mini")
    answer = str(payload.get("answer") or "")
    explaining = asks_for_meaning(answer)
    outcome = "" if explaining else turn_outcome(answer)
    if outcome:
        return move_on(payload, outcome)
    payload = {**payload, "asked": clean_asked(str(payload.get("asked") or ""))}
    request_body = {
        "model": model,
        "temperature": 0.4,
        "max_tokens": 1024,
        "messages": [
            {"role": "system", "content": EXPLAINER if explaining else INTERVIEWER},
            {"role": "user", "content": json.dumps(payload)},
        ],
    }
    if "groq.com" in base:
        request_body["reasoning_effort"] = "low"
    if "openrouter.ai" in base:
        request_body["provider"] = {"sort": "latency"}
        request_body["reasoning"] = {"enabled": False}
    use_schema = "groq.com" in base
    data = None
    for attempt in range(3):
        attempt_body = dict(request_body)
        if use_schema:
            attempt_body["response_format"] = INTERVIEWER_SCHEMA
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
            if error.code not in (429, 503) or attempt == 2:
                raise RuntimeError(f"The model refused the reply. {detail}") from error
        except TimeoutError:
            if attempt == 2:
                raise RuntimeError("The model is busy. Submit the answer again.")
        time.sleep(2)
    if data is None:
        raise RuntimeError("The model is busy. Submit the answer again.")
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
            raise RuntimeError("The model returned an empty reply.")
        parsed = fallback_line(payload)
    action = parsed.get("action", "stay")
    if action not in ("stay", "advance", "finish"):
        action = "stay"
    prompt = spoken_only(str(parsed.get("prompt", "")).strip())
    if not prompt:
        prompt = fallback_line(payload)["prompt"]
        action = "stay"
    asked = str(payload.get("asked") or "")
    planned = str(payload.get("plannedPrompt") or "")
    if explaining:
        action = "stay"
        if len(prompt.split()) < 12 or "two spoken" in prompt.lower() or quizzes_them(prompt) or (asked and same_line(prompt, asked)):
            heard = f"{payload.get('answer') or ''} {payload.get('priorAnswer') or ''} {asked}".lower()
            prompt = (
                "Reliability means the service still works when a payment fails or a time slot is already taken. In the service you described, what failed, or what were you worried would fail?"
                if "reliab" in heard
                else "I'll say that in plain words. It is the ordinary idea behind the question, not a term you have to define. Using what you already told me, what did you do?"
            )
    elif asked and same_line(prompt, asked):
        action = "advance"
        if planned and not same_line(planned, asked):
            prompt = planned
    hint = "" if payload.get("practiceMode") != "coach" else str(parsed.get("hint", "")).strip()
    try:
        probes = int(payload.get("probes") or 0)
    except (TypeError, ValueError):
        probes = 0
    if probes >= 2 and action == "stay":
        action = "advance"
        if planned and not same_line(planned, asked):
            prompt = planned
    return {
        "sectionName": payload.get("section", ""),
        "prompt": prompt,
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
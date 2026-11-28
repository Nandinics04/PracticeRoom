from server import draft_questions

questions = draft_questions(
    "Software Engineer at Google",
    ["Background", "Core concepts", "Follow-ups"],
)
assert questions[0]["sectionName"] == "Background"
assert "Reported for" not in questions[0]["prompt"]
assert "Source:" not in questions[0]["prompt"]
assert len(questions[0]["prompt"]) > 40
print(questions[0]["prompt"])

guided = draft_questions(
    "Software Engineer at Amazon",
    ["Background", "Core concepts", "Follow-ups"],
    [{
        "platform": "supplied",
        "title": "Amazon OA",
        "url": "https://leetcode.com/discuss/post/8428320/example",
        "excerpt": "Arrays and two pointers are the main online assessment pattern. | Prepare two STAR stories for Customer Obsession.",
    }],
)
assert "two pointers" in guided[0]["prompt"]
assert "Customer Obsession" in guided[1]["prompt"]
assert "Reported for" not in guided[0]["prompt"]
assert "Keep the focus" not in guided[0]["prompt"]
assert "I want to hear how you would handle this" not in guided[0]["prompt"]
methodology = draft_questions(
    "Software Engineer at Amazon",
    ["Background", "Core concepts", "Follow-ups"],
    [{
        "platform": "supplied",
        "title": "How AI interviews work",
        "url": "https://example.com/methodology",
        "excerpt": "An AI interview works by combining speech recognition, natural language processing, and sentiment analysis.",
    }],
)
assert "speech recognition" not in methodology[0]["prompt"].lower()
behavioral = draft_questions(
    "Software Engineer at Google",
    ["Warm-up & Pitch", "Resume Deep-Dive", "Core Competency Scenarios", "Culture Fit & Reverse Q&A"],
    interviewType="behavioral",
)
technical = draft_questions(
    "Software Engineer at Google",
    ["Background", "Core concepts", "Follow-ups"],
    interviewType="technical",
)
assert behavioral[0]["prompt"] != technical[0]["prompt"]
assert len(behavioral) == 4
assert "walk me through how you would solve a coding problem" not in behavioral[0]["prompt"].lower()
print("draft questions ok")
import json
import sys

from server import model_reply, prepare_questions, repair_spoken, transcribe_speech


def handle(message: dict) -> object:
    op = message.get("op")
    payload = message.get("payload") or {}
    if op == "ready":
        return {"ready": True}
    if op == "prepare":
        return prepare_questions(payload)
    if op == "reply":
        return model_reply(payload)
    if op == "transcribe":
        return transcribe_speech(payload)
    if op == "repair":
        return {"answer": repair_spoken(payload)}
    raise RuntimeError("Unknown interviewer request.")


def main() -> None:
    for line in sys.stdin:
        text = line.strip()
        if not text:
            continue
        message_id = None
        try:
            message = json.loads(text)
            message_id = message.get("id")
            result = {"id": message_id, "ok": True, "result": handle(message)}
        except Exception as error:
            result = {"id": message_id, "ok": False, "error": str(error)}
        sys.stdout.write(json.dumps(result) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(error, file=sys.stderr)
        raise SystemExit(1) from error

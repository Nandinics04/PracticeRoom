import json
import sys

from server import prepare_questions


def main() -> None:
    payload = json.loads(sys.stdin.read() or "{}")
    json.dump(prepare_questions(payload), sys.stdout)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(error, file=sys.stderr)
        raise SystemExit(1) from error

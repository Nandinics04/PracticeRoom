import json
import sys

from server import model_reply


def main() -> None:
    payload = json.loads(sys.stdin.read() or "{}")
    json.dump(model_reply(payload), sys.stdout)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(error, file=sys.stderr)
        raise SystemExit(1) from error

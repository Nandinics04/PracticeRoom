import json
import sys

from server import plan_setup


def main() -> None:
    request = json.loads(sys.stdin.read() or "{}").get("request", "")
    json.dump(plan_setup(str(request)), sys.stdout)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(error, file=sys.stderr)
        raise SystemExit(1) from error

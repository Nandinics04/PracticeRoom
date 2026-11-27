import asyncio
import json
import sys
from mcp import ClientSession
from mcp.client.stdio import StdioServerParameters, stdio_client

async def main():
    request = json.loads(sys.stdin.read())
    params = StdioServerParameters(command="python", args=["server.py"])
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            result = await session.call_tool("draft_questions", request)
            json.dump(result.structured_content["result"], sys.stdout)

asyncio.run(main())
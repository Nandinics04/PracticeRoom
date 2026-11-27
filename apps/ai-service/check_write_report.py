import asyncio
import json
from mcp import ClientSession
from mcp.client.stdio import StdioServerParameters, stdio_client

async def main():
    params = StdioServerParameters(command="python", args=["server.py"])
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            result = await session.call_tool(
                "write_report",
                {
                    "transcript": [
                        {
                            "sectionName": "Background",
                            "prompt": "Discuss background",
                            "answer": "I designed a service and chose a cache to keep reads fast.",
                        }
                    ]
                },
            )
            report = json.loads(result.content[0].text)
            assert report["overallScore"] == 80
            assert report["strengths"] == ["Developed answer in Background."]
            print("write report ok")

asyncio.run(main())
import vm from "node:vm";

export type CodeRun = {
    output: string;
    error: string;
    elapsedMs: number;
};

export function inspectCandidateCode(code: string): CodeRun {
    const source = code.trim();
    if (!source) {
        return { output: "", error: "", elapsedMs: 0 };
    }
    const logs: string[] = [];
    const started = Date.now();
    try {
        vm.runInNewContext(source, {
            console: {
                log: (...parts: unknown[]) => {
                    logs.push(parts.map((part) => String(part)).join(" "));
                },
            },
        }, { timeout: 1500 });
        return {
            output: logs.length > 0 ? logs.join("\n") : "The code ran and printed nothing.",
            error: "",
            elapsedMs: Date.now() - started,
        };
    } catch (error) {
        return {
            output: "",
            error: error instanceof Error ? error.message : "The code failed",
            elapsedMs: Date.now() - started,
        };
    }
}

function otherLanguage(source: string): string {
    if (/#include|using namespace|int main\s*\(/.test(source)) {
        return "C or C++";
    }
    if (/^\s*(def |import |from |print\(|class )/m.test(source) && !/\b(function|const|let|console)\b/.test(source)) {
        return "Python";
    }
    return "";
}

export function runCandidateCode(code: string): string {
    const source = code.trim();
    if (!source) {
        return "";
    }
    const language = otherLanguage(source);
    if (language) {
        return [
            "Candidate code:",
            source.slice(0, 4000),
            `This runner executes JavaScript only. It did not compile this ${language} code. That is not an error in the solution.`,
        ].join("\n");
    }
    const run = inspectCandidateCode(source);
    return [
        "Candidate code:",
        source.slice(0, 4000),
        `Elapsed milliseconds: ${run.elapsedMs}`,
        run.error ? `Error: ${run.error}` : "Error: none",
        `Console: ${run.output || "none"}`,
    ].join("\n");
}

export type CodingProblem = {
    statement: string;
    constraints: string[];
    input: string;
    output: string;
};

export function editorLanguage(topic: string) {
    const text = topic.toLowerCase();
    if (/c\+\+|cpp/.test(text)) {
        return "cpp";
    }
    if (/\bpython\b/.test(text)) {
        return "python";
    }
    if (/\bjava\b/.test(text) && !/javascript/.test(text)) {
        return "java";
    }
    if (/javascript|\bjs\b|node|react/.test(text)) {
        return "javascript";
    }
    return "typescript";
}

export function languageLabel(language: string) {
    if (language === "cpp") {
        return "C++";
    }
    if (language === "python") {
        return "Python";
    }
    if (language === "java") {
        return "Java";
    }
    if (language === "javascript") {
        return "JavaScript";
    }
    return "TypeScript";
}

export function starterFor(language: string) {
    if (language === "cpp") {
        return "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n  \n}\n";
    }
    if (language === "python") {
        return "def solve():\n    pass\n\nif __name__ == \"__main__\":\n    print(solve())\n";
    }
    if (language === "java") {
        return "class Solution {\n  public static void main(String[] args) {\n  }\n}\n";
    }
    return "function solve() {\n  \n}\n\nconsole.log(solve());\n";
}

export function canRun(language: string) {
    return language === "javascript" || language === "typescript";
}

function field(text: string, label: string) {
    const match = text.match(new RegExp(`${label}\\s*\\n([\\s\\S]*?)(?=\\n[A-Z][a-zA-Z ]{0,24}\\n|$)`, "i"));
    return match?.[1]?.trim() ?? "";
}

export function readCodingProblem(prompt: string): CodingProblem {
    const text = prompt.replace(/\r/g, "").trim();
    const statement = field(text, "Problem statement");
    const constraints = field(text, "Constraints")
        .split("\n")
        .map((line) => line.replace(/^- /, "").trim())
        .filter(Boolean);
    const example = field(text, "Example");
    const input = example.match(/Input:\s*(.+)/i)?.[1]?.trim() ?? "";
    const output = example.match(/Output:\s*(.+)/i)?.[1]?.trim() ?? "";
    if (statement && constraints.length > 0 && input && output) {
        return { statement, constraints, input, output };
    }
    return {
        statement: text || "Prepare a new room. The question is written from the company, role, and skills you enter.",
        constraints: [],
        input: "",
        output: "",
    };
}

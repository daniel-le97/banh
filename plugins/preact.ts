import { Buchta } from "../src/buchta";
import { BuchtaRequest } from "../src/request";
import { BuchtaResponse } from "../src/response";

// @ts-ignore It is there
import { spawnSync } from "bun";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { basename, dirname } from "path";
import { chdir } from "process";

export function preact(buchtaPreact: any = {ssr: false}) {

    const opts = buchtaPreact;

    const patched: Map<string, Array<string>> = new Map();
    const htmls: Map<string, string | undefined> = new Map();

    function pageGen(this: Buchta, code: string, html: string) {
        const template = this.getTemplate("preact.html");
        if (template)
            return template.replace("<!-- html -->", () => html).replace("<!-- code -->", () => `
<script type="module">
${code}
</script>
`);

        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body>
${html}
</body>
<script type="module">
${code}
</script>
</html>
`
    }

    // hides file imports so that the bundler won't get confused
    const hideJsxImports = (route: string, code: string) => {
        const split: string[] = code.split("\n");
        for (let i = 0; i < split.length; i++) {
            if (split[i].includes("import") && (split[i].includes(".jsx") || split[i].includes(".js") || split[i].includes(".ts"))) {
                if (!patched.has(route)) {
                    patched.set(route, new Array());
                }
                const obj = patched.get(route);
                if (obj)
                    obj.push(split[i]);
                split[i] = `// ${split[i]}`;
            }
        }
        return split.join("\n");
    }

    const preSSR = (route: string, code: string, defaultFileName: string, ext: string) => {
        if (patched.has(route)) {
            const obj = patched.get(route);
            let before = "";
            if (obj)
                for (const e of obj) {
                    before += `${e}\n`;
                }
            code = `${before}\n${code}`;
        }
        // @ts-ignore It is there
        code = code.replaceAll(".tsx", ".js").replaceAll(".jsx", ".js");
        let basePath = process.cwd() + "/.buchta/"
        if (!existsSync(basePath + "pre-ssr")) {
            mkdirSync(basePath + "pre-ssr");
        }
        basePath += "pre-ssr";

        if (!existsSync(basePath + dirname(route))) {
            mkdirSync(basePath + dirname(route), {recursive: true});
        }

        // @ts-ignore It is there
        writeFileSync(basePath + route.replaceAll(".tsx", ".js").replaceAll(".jsx", ".js"), code);

        if (basename(route) == `${defaultFileName}${ext}`) {
            writeFileSync(basePath + route.replace(ext, ".js"), code + "console.log(render(index()))");
            chdir(basePath);
            const { stdout, stderr } = spawnSync(["bun", route.replace(ext, ".js").replace("/", "./")])
            console.log(stderr?.toString());
            htmls.set(route.replace(`${defaultFileName}${ext}`, ""), stdout?.toString());
            chdir("../..");
        }
    }
    
    function patchAfterBundle(this: Buchta, route: string, code: string) {
        if (patched.has(route)) {
            const obj = patched.get(route);
            let before = "";
            if (obj)
                for (const e of obj) {
                    before += `${e}\n`;
                }
            code = `${before}\n${code}`;
        }
        if (route.endsWith(`${this.getDefaultFileName()}.jsx`) || route.endsWith(`${this.getDefaultFileName()}.tsx`)) {
            route = route.substring(0, route.length - 4 - this.getDefaultFileName().length);
        }

        if (route.endsWith(".jsx") || route.endsWith(".tsx")) {
            this.get(route, (_req: BuchtaRequest, res: BuchtaResponse) => {
                res.send(code);
                res.setHeader("Content-Type", "text/javascript");
            });
        } else {
            this.get(route, (_req: BuchtaRequest, res: BuchtaResponse) => {
                res.send(pageGen.call(this, code, htmls.get(route) || ""));
                res.setHeader("Content-Type", "text/html");
            });
        }
    }

    function handle(this: Buchta, route: string, file: string, ext: string) {
        const content = readFileSync(file, { encoding: "utf-8" });

            // @ts-ignore It is there
            const transpiler = new Bun.Transpiler({ loader: "tsx", 
                                                    tsconfig: JSON.stringify({
                                                        "compilerOptions": {
                                                            "jsx": "react",
                                                            "jsxFactory": "h",
                                                            "jsxFragmentFactory": "Fragment",
                                                        }
                                                })});
                                                
            if (opts.ssr == undefined) throw new Error("ssr field in config is missing!");
            let code;
            if (opts.ssr) {
                code = `import { h, hydrate, Fragment } from "preact";import render from "preact-render-to-string";\n${transpiler.transformSync(content, {})}\n`;
            } else {
                code = `import { h, hydrate, Fragment } from "preact";\n${transpiler.transformSync(content, {})}\n`;
            }

            // @ts-ignore It is there
            code = hideJsxImports(route, code).replaceAll("jsxEl", "_jsxEl").replaceAll("JSXFrag", "_JSXFrag");

            if (opts.ssr) {
                preSSR(route, code, this.getDefaultFileName(), ext);
            }

            if (route.endsWith(`${this.getDefaultFileName()}${ext}`)) {
                let route2 = route.substring(0, route.length - 4 - this.getDefaultFileName().length);

                if (!route2.endsWith(ext)) {
                    code += "\nhydrate(index(), document.body)\n";
                }
            }
            
            this.bundler.addCustomFile(route, `${route.replace(ext, ".js")}`, code);
            this.bundler.addPatch(route, patchAfterBundle);
    }

    return function (this: Buchta) {

        if (opts.ssr) {
            try {
                require("preact-render-to-string");
            } catch {
                throw new Error("To use SSR with Preact, please install 'preact-render-to-string'");
            }
        }

        this.assignExtHandler("jsx", (route: string, file: string) => {
            handle.call(this, route, file, ".jsx");
        });

        if (opts.tsx) {
            this.assignExtHandler("tsx", (route: string, file: string) => {
                handle.call(this, route, file, ".tsx");
            });
        }
    }
}
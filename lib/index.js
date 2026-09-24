/**
 * @local/dsh-dashboard 宿主半：render_dashboard 工具。
 *
 * 以子进程跑工作区渲染器 scripts/render_dashboard.py（输出 <case_dir>/dashboard.html），
 * 复制到工作区 dashboard/latest.html，成功后经 tools/result 追加
 * deliverables/presented 事件（附 dashboard 标记字段），浏览器半监听该事件
 * 自动打开右侧栏"指标看板"tab。
 *
 * 事件载体说明：不使用自定义事件类型（如 dashboard/rendered）——持久化读路径
 * 会拒绝 KNOWN_SESSION_EVENT_TYPES 之外且未标 ignorable 的事件，而
 * Session.append 无法写 ignorable 标记；deliverables/presented 是已知类型，
 * 载荷 merge-extensible，额外字段 dashboard 携带自动打开所需信息。
 */
import { spawn } from "node:child_process";
import { copyFile, mkdir, stat } from "node:fs/promises";
import { basename, isAbsolute, join, resolve } from "node:path";
import { defineTool } from "@deepseek-ai/dsh-tools";

/** Stable Loader identity. */
const name = "dashboard";

/** 宿主侧服务：工具注册表与会话投影（取当前 turn）。 */
const inject = ["tools", "sessionProjections"];

/** 工作区内固定输出路径（相对会话工作区根）。 */
const LATEST_PATH = "dashboard/latest.html";

/** 运行一个子进程并收集输出；signal 中止时随 spawn 语义拒绝。 */
function spawnWait(command, args, cwd, signal) {
	return new Promise((resolveRun, rejectRun) => {
		const child = spawn(command, args, { cwd, signal, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
		const collect = (chunks) => (chunk) => {
			chunks.push(chunk);
			if (chunks.length > 64) chunks.splice(0, chunks.length - 64);
		};
		const outChunks = [];
		const errChunks = [];
		child.stdout.on("data", collect(outChunks));
		child.stderr.on("data", collect(errChunks));
		child.on("error", rejectRun);
		child.on("close", (exitCode) => resolveRun({
			exitCode,
			stdout: Buffer.concat(outChunks).toString("utf8").slice(-262144),
			stderr: Buffer.concat(errChunks).toString("utf8").slice(-262144)
		}));
	});
}

/** 跑渲染器；--config 不被当前 v2 渲染器认识时回退重试一次。 */
async function runRenderer(signal, baseArgs, configArgs, cwd) {
	if (configArgs.length === 0) return spawnWait("python", baseArgs, cwd, signal);
	const withConfig = await spawnWait("python", [...baseArgs, ...configArgs], cwd, signal);
	if (withConfig.exitCode === 0 || !withConfig.stderr.includes("unrecognized arguments")) return withConfig;
	return spawnWait("python", baseArgs, cwd, signal);
}

/**
 * 宿主半插件体：注册 render_dashboard 工具，成功后追加 presented 事件。
 * @param ctx - agent 作用域服务。
 */
function apply(ctx) {
	/** 一次执行到其事件的暂存：execute 记录，tools/result 确认成功后落地。 */
	const pending = new WeakMap();

	ctx.tools.register(defineTool({
		name: "render_dashboard",
		description: "Render an analytics dashboard (分析看板) as one self-contained offline HTML file and open it in the user's right-sidebar 指标看板 tab. Runs the workspace renderer scripts/render_universal_dashboard.py (config v2: components[] free composition — 24-col grid, 12 component types kpi/line/bar/pie/heatmap/table/histogram/funnel/bullet/area_stack/scatter/text; reads <case_dir>/dashboard.config.yaml + warehouse.db + artifacts/口径卡.md), writes <case_dir>/dashboard.html; this tool also copies it to dashboard/latest.html in the workspace root. Call this whenever the user asks for a 看板 / 数据看板 / dashboard / 可视化总览 of a case whose warehouse.db is built. For fully custom chart requests you may still hand-write a single-file HTML and present it; prefer this tool for the standard analytics dashboard.",
		parameters: {
			case_dir: {
				type: "string",
				required: true,
				description: "数据目录（含 warehouse.db，理想情况下还有 artifacts/口径卡.md）。相对会话工作区根或绝对路径。例：鸟撞演示案例"
			},
			config_path: {
				type: "string",
				description: "可选 dashboard.config 路径。缺省自动发现 dashboard.config.yaml / .yml / .json；传此参数用自定义配置。"
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					html_path: {
						type: "string",
						required: true,
						description: "渲染器原始输出（<case_dir>/dashboard.html）"
					},
					latest_path: {
						type: "string",
						required: true,
						description: "工作区聚合路径（dashboard/latest.html），右侧栏看板 tab 展示这份"
					},
					bytes: {
						type: "integer",
						required: true,
						description: "HTML 文件字节数"
					}
				}
			},
			render: (_args, value) => [{
				type: "text",
				text: `已生成分析看板：${value.html_path} → ${value.latest_path}（已在右侧栏"指标看板"打开）`
			}]
		},
		timeoutMs: 180000,
		async execute(args, exec) {
			if (exec.agent === void 0) throw new Error("render_dashboard requires an agent Session");
			const session = exec.agent.session;
			const cwd = session.header.cwd;
			if (cwd === void 0) throw new Error("render_dashboard requires a workspace");
			const boundary = ctx.sessionProjections.stateOf(session, "turnBoundary");
			if (boundary === void 0 || boundary.openTurnStartSeq === null) throw new Error("render_dashboard requires an open turn");

			const caseDir = isAbsolute(args.case_dir) ? args.case_dir : resolve(cwd, args.case_dir);
			const renderer = join(cwd, "scripts", "render_universal_dashboard.py");
			const caseHtml = join(caseDir, "dashboard.html");
			const latestHtml = join(cwd, "dashboard", "latest.html");

			const dbInfo = await stat(join(caseDir, "warehouse.db")).catch(() => undefined);
			if (dbInfo === undefined) throw new Error(`Cannot render dashboard: ${join(caseDir, "warehouse.db")} not found. case_dir 必须指向已建仓（含 warehouse.db）的数据目录。`);
			const rendererInfo = await stat(renderer).catch(() => undefined);
			if (rendererInfo === undefined) throw new Error(`Renderer not found: ${renderer}`);
			let configPath;
			if (typeof args.config_path === "string" && args.config_path.trim() !== "") {
				configPath = isAbsolute(args.config_path) ? args.config_path : resolve(cwd, args.config_path);
				const configInfo = await stat(configPath).catch(() => undefined);
				if (configInfo === undefined) throw new Error(`config_path not found: ${configPath}`);
			}

			exec.signal.throwIfAborted();

			const baseArgs = [renderer, caseDir];
			const configArgs = configPath === undefined ? [] : ["--config", configPath];
			const run = await runRenderer(exec.signal, baseArgs, configArgs, cwd);
			if (run.exitCode !== 0) {
				throw new Error(`render_dashboard.py failed (exit ${run.exitCode}):\n${run.stderr.slice(-1200) || run.stdout.slice(-1200)}`);
			}

			const htmlInfo = await stat(caseHtml).catch(() => undefined);
			if (htmlInfo === undefined) throw new Error(`Renderer reported success but ${caseHtml} was not written.`);
			await mkdir(join(cwd, "dashboard"), { recursive: true });
			await copyFile(caseHtml, latestHtml);
			const latestInfo = await stat(latestHtml);

			exec.signal.throwIfAborted();
			pending.set(exec, {
				session,
				turn: boundary.lastTurn,
				files: [{ path: LATEST_PATH, description: `${basename(caseDir)} 分析看板（最新渲染）` }],
				dashboard: {
					sessionId: String(session.id),
					path: LATEST_PATH,
					title: `${basename(caseDir)} · 分析看板`
				}
			});
			return {
				html_path: caseHtml.replaceAll("\\", "/"),
				latest_path: LATEST_PATH,
				bytes: latestInfo.size
			};
		}
	}));

	ctx.on("tools/result", (exec, result) => {
		const delivery = pending.get(exec);
		pending.delete(exec);
		if (delivery === void 0 || result.isError) return;
		const { session, turn, files, dashboard } = delivery;
		session.append("deliverables/presented", {
			turn,
			callId: exec.callId,
			files,
			dashboard
		});
	});
}

export { apply, inject, name };

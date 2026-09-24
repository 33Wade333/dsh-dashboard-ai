window.__ModuleLoader__.load({
	id: "dsh-dashboard-ai",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region lib/types/client/address.js
		/** The resource scheme and type every dashboard address opens with. */
		const DASHBOARD_ADDRESS_PREFIX = "dsh-resource://dashboard/";
		/**
		 * Read a dashboard address back into its session and workspace-relative path.
		 * Segments are decoded per segment, matching how the address was built.
		 * @param address - a candidate `dsh-resource://dashboard/…` address.
		 * @returns the session id and path, or undefined when malformed.
		 */
		function parseDashboardAddress(address) {
			try {
				if (!address.startsWith(DASHBOARD_ADDRESS_PREFIX)) return void 0;
				const rest = address.slice(DASHBOARD_ADDRESS_PREFIX.length);
				const cut = rest.search(/[?#]/);
				const body = cut === -1 ? rest : rest.slice(0, cut);
				const [id, ...segments] = body.split("/");
				if (id === void 0 || id === "" || segments.length === 0) return void 0;
				return {
					sessionId: decodeURIComponent(id),
					path: segments.map(decodeURIComponent).join("/")
				};
			} catch {
				return void 0;
			}
		}
		/**
		 * Build the dashboard address of one file read through one Session.
		 * @param sessionId - the Session whose Host workspace resolves the path.
		 * @param path - workspace-relative path with `/` separators.
		 * @returns the `dsh-resource://dashboard/<sessionId>/<path>` address.
		 */
		function dashboardAddress(sessionId, path) {
			const encodeSegment = (segment) => encodeURIComponent(segment);
			const encodedPath = path.split("/").map(encodeSegment).join("/");
			return `${DASHBOARD_ADDRESS_PREFIX}${encodeSegment(sessionId)}/${encodedPath}`;
		}
		//#endregion
		//#region lib/types/client/render-store.js
		/** Authenticated POST route (registered by ui-deliverables) that reveals a presented file on the Host desktop. */
		const PRESENT_OPEN_PATH = "/api/present.open";
		/** Render metadata per `${sessionId}/${path}`: content version, latest presented seq, title. */
		const renders = /* @__PURE__ */ new Map();
		const renderListeners = /* @__PURE__ */ new Set();
		function keyOf(sessionId, path) {
			return `${sessionId}/${path}`;
		}
		function notifyRenders() {
			for (const listener of [...renderListeners]) listener();
		}
		/** Record one render event (replay or live): keep the latest seq/title, bumping the content version on a new seq. */
		function recordRender(sessionId, path, entry) {
			const key = keyOf(sessionId, path);
			const previous = renders.get(key);
			const isNew = typeof entry.seq === "number" && (previous?.seq === void 0 || entry.seq > previous.seq);
			renders.set(key, {
				version: (previous?.version ?? 0) + (isNew ? 1 : 0),
				seq: isNew ? entry.seq : previous?.seq,
				title: entry.title ?? previous?.title
			});
			notifyRenders();
		}
		/** Bump only the content version: the refresh button re-reads the same file. */
		function refreshRender(sessionId, path) {
			const key = keyOf(sessionId, path);
			const previous = renders.get(key);
			renders.set(key, { ...(previous ?? { seq: void 0, title: void 0 }), version: (previous?.version ?? 0) + 1 });
			notifyRenders();
		}
		/** useSyncExternalStore subscribe face for the render table. */
		function subscribeRenders(listener) {
			renderListeners.add(listener);
			return () => {
				renderListeners.delete(listener);
			};
		}
		/** Stable snapshot for one key; a shared frozen empty record keeps identity stable. */
		const EMPTY_RENDER = Object.freeze({ version: 0, seq: void 0, title: void 0 });
		function renderSnapshotOf(key) {
			return renders.get(key) ?? EMPTY_RENDER;
		}
		/** Ask the Host to reveal the presented file in the desktop file manager. */
		async function revealInFileManager(sessionId, seq) {
			const query = new URLSearchParams({ sessionId, seq: String(seq), index: "0", action: "reveal" });
			try {
				const response = await fetch(`${PRESENT_OPEN_PATH}?${query.toString()}`, { method: "POST" });
				return response.ok ? "revealed" : response.status === 422 ? "nativeUnavailable" : "revealError";
			} catch {
				return "revealError";
			}
		}
		//#endregion
		//#region lib/types/client/dashboard.css.mjs
		const css = ".dshdb_frame{box-sizing:border-box;width:100%;height:100%;display:flex;flex-direction:column;background:var(--dsw-alias-bg-base,#f5f6f7);font-family:var(--dsw-font,sans-serif)}.dshdb_chrome{display:flex;align-items:center;gap:8px;flex:none;padding:6px 10px;border-bottom:1px solid var(--dsw-alias-border,#dee0e3);background:var(--dsw-alias-bg-surface,#fff)}.dshdb_title{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary,#1f2329);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dshdb_button{display:inline-flex;align-items:center;gap:4px;flex:none;border:1px solid var(--dsw-alias-border,#dee0e3);border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#646a73);font-size:12px;line-height:1;padding:5px 9px;cursor:pointer}.dshdb_button:hover{color:var(--dsw-alias-label-primary,#1f2329);background:var(--dsw-alias-bg-hover,#f2f3f5)}.dshdb_button:disabled{opacity:.5;cursor:default}.dshdb_body{flex:1;min-height:0;position:relative}.dshdb_iframe{border:none;width:100%;height:100%;display:block;background:#fff}.dshdb_status{box-sizing:border-box;width:100%;height:100%;color:var(--dsw-alias-label-secondary,#646a73);white-space:normal;justify-content:center;align-items:center;margin:0;padding:10px;font-size:13px;line-height:1.5;display:flex}";
		const tagId = "dsh-dashboard-ai/dashboard.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-dashboard-ai";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		//#endregion
		//#region lib/types/client/DashboardBody.js
		/** Decode a base64 WorkspaceFileBytes payload into native bytes. */
		function decodeBase64(value) {
			const binary = atob(value);
			const data = new Uint8Array(binary.length);
			for (let index = 0; index < binary.length; index++) data[index] = binary.charCodeAt(index);
			return data;
		}
		/** Read the `<title>` text out of dashboard HTML bytes, when present. */
		function titleOfHtmlBytes(bytes) {
			try {
				const head = new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, 4096));
				const match = head.match(/<title[^>]*>([^<]*)<\/title>/i);
				return match === null ? void 0 : match[1].trim();
			} catch {
				return void 0;
			}
		}
		/**
		 * The chrome bar: the dashboard's title, a refresh button re-reading the
		 * file, and a reveal button opening the file manager at its location.
		 * @param props - the addressed file, its render metadata, and locale.
		 * @returns the bar above the rendered dashboard.
		 */
		function DashboardChrome({ file, meta, t }) {
			const [revealState, setRevealState] = react.useState("idle");
			const reveal = react.useCallback(() => {
				if (meta.seq === void 0) return;
				setRevealState("revealing");
				revealInFileManager(file.sessionId, meta.seq).then(setRevealState);
			}, [file.sessionId, meta.seq]);
			return (0, react_jsx_runtime.jsxs)("div", {
				className: "dshdb_chrome",
				"data-dashboard-chrome": true,
				children: [
					(0, react_jsx_runtime.jsx)("span", {
						className: "dshdb_title",
						title: file.path,
						children: meta.title ?? file.path
					}),
					(0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "dshdb_button",
						onClick: () => {
							refreshRender(file.sessionId, file.path);
						},
						children: t("refresh")
					}),
					(0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "dshdb_button",
						disabled: meta.seq === void 0 || revealState === "revealing",
						onClick: reveal,
						children: revealState === "revealing" ? t("revealing") : revealState === "revealed" ? t("revealed") : revealState === "revealError" || revealState === "nativeUnavailable" ? t("revealError") : t("reveal")
					})
				]
			});
		}
		/**
		 * The dashboard tab's body: reads the addressed HTML through the Session
		 * filesystem and renders it in a script-enabled opaque iframe. Re-reads
		 * whenever a live render event or the refresh button bumps the version.
		 * @param props - composed slot props: useTabInfo, the bound reader, locale.
		 * @returns the pane content for one dashboard tab.
		 */
		function DashboardBody({ useTabInfo, readDashboard, useDashboardRender, t }) {
			const { tab } = useTabInfo();
			const file = react.useMemo(() => parseDashboardAddress(tab.contentId), [tab.contentId]);
			const renderKey = file === void 0 ? "" : keyOf(file.sessionId, file.path);
			const meta = useDashboardRender(renderKey);
			const [frame, setFrame] = react.useState({ phase: "loading" });
			react.useEffect(() => {
				if (file === void 0) {
					setFrame({ phase: "page" });
					return;
				}
				let url;
				let alive = true;
				const controller = new AbortController();
				const lifetime = typeof AbortSignal.any === "function" ? AbortSignal.any([tab.signal, controller.signal]) : tab.signal;
				setFrame({ phase: "loading" });
				(async () => {
					try {
						const result = await readDashboard(file.sessionId, file.path, lifetime);
						if (!alive) return;
						if (!result.ok) {
							setFrame({ phase: "failed", reason: result.error?.message ?? "unreadable" });
							return;
						}
						const bytes = decodeBase64(result.value.data);
						url = URL.createObjectURL(new Blob([bytes], { type: "text/html" }));
						if (!alive) {
							URL.revokeObjectURL(url);
							return;
						}
						setFrame({ phase: "ready", url, bytes: bytes.byteLength, title: titleOfHtmlBytes(bytes) });
					} catch (error) {
						if (alive && !lifetime.aborted) setFrame({ phase: "failed", reason: String(error) });
					}
				})();
				return () => {
					alive = false;
					controller.abort();
					if (url !== void 0) URL.revokeObjectURL(url);
				};
			}, [file?.sessionId, file?.path, meta.version, tab.signal]);
			if (file === void 0 || frame.phase === "page") return (0, react_jsx_runtime.jsx)("div", {
				className: "dshdb_frame",
				"data-dashboard-tab": true,
				children: (0, react_jsx_runtime.jsx)("p", { className: "dshdb_status", children: t("placeholderPage") })
			}, tab.contentId);
			const title = meta.title ?? frame.title;
			return (0, react_jsx_runtime.jsxs)("div", {
				className: "dshdb_frame",
				"data-dashboard-tab": true,
				children: [
					(0, react_jsx_runtime.jsx)(DashboardChrome, { file: file, meta: { ...meta, title }, t }),
					frame.phase === "loading" ? (0, react_jsx_runtime.jsx)("p", {
						className: "dshdb_status",
						role: "status",
						children: t("loading")
					}) : frame.phase === "failed" ? (0, react_jsx_runtime.jsx)("p", {
						className: "dshdb_status",
						role: "alert",
						children: t("failed", { reason: frame.reason })
					}) : (0, react_jsx_runtime.jsx)("div", {
						className: "dshdb_body",
						children: (0, react_jsx_runtime.jsx)("iframe", {
							className: "dshdb_iframe",
							src: frame.url,
							sandbox: "allow-scripts allow-fullscreen allow-popups",
							title: t("frame"),
							"data-dashboard-frame": true
						})
					})
				]
			}, `${tab.contentId}#${meta.version}`);
		}
		//#endregion
		//#region lib/types/client/DashboardTitle.js
		/** The dashboard tab's live chip title. */
		function DashboardTitle({ useTabInfo, t }) {
			const { tab } = useTabInfo();
			return (0, react_jsx_runtime.jsx)("span", {
				"data-dashboard-title": true,
				children: t("chip")
			});
		}
		//#endregion
		//#region lib/types/client/events.js
		/**
		 * The rendered-event Definition: matches deliverables/presented events
		 * carrying the `dashboard` marker appended by the host half's
		 * render_dashboard tool, and auto-opens the dashboard tab for live ones.
		 * @param activatedAt - wall clock when this plugin activated; older
		 * events are replayed history and never re-open.
		 * @param openDashboard - opens the resource address in its session.
		 * @returns the Definition to register.
		 */
		function dashboardEventDefinition(activatedAt, openDashboard) {
			return {
				kind: "dashboard-rendered",
				match: (event) => {
					if (event.type !== "deliverables/presented") return null;
					const data = event.data;
					if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
					const marker = data.dashboard;
					if (typeof marker !== "object" || marker === null || typeof marker.path !== "string" || marker.path.length === 0) {
						try {
							console.info(`[dashboard] saw presented seq=${String(event.seq)} without dashboard marker; ignoring`);
						} catch {}
						return null;
					}
					return { id: `dashboard-${String(event.seq)}`, role: "start" };
				},
				start: (context, match) => {
					const marker = match.event.data.dashboard;
					const live = match.event.time >= activatedAt;
					recordRender(marker.sessionId, marker.path, {
						seq: match.event.seq,
						title: typeof marker.title === "string" ? marker.title : void 0
					});
					if (live && typeof marker.sessionId === "string" && marker.sessionId.length > 0) {
						const open = () => {
							try {
								openDashboard(marker.sessionId, marker.path);
							} catch (error) {
								console.warn("[dashboard] auto-open failed:", error);
							}
						};
						try {
							console.info(`[dashboard] auto-opening ${marker.path} in session ${marker.sessionId.slice(0, 8)}…`);
						} catch {}
						open();
						// 会话停靠面与对话装配可能存在装配次序：延迟重开一次（同 contentId 幂等聚焦）
						setTimeout(open, 800);
					}
					return { seq: match.event.seq, live };
				}
			};
		}
		//#endregion
		//#region lib/types/client/locales.js
		/** Locale-owned copy for the dashboard tab. */
		const zh = {
			chip: "指标看板",
			guideTitle: "指标看板",
			guideDescription: "分析看板面板：render_dashboard 渲染完成后自动展示",
			placeholderPage: "看板插件已装载。这里展示 render_dashboard 生成的分析看板；让智能体\"生成分析看板\"后自动打开。",
			loading: "正在读取看板…",
			failed: "无法读取看板文件：{reason}",
			frame: "分析看板",
			refresh: "刷新",
			reveal: "在文件管理器打开",
			revealing: "正在打开…",
			revealed: "已打开",
			revealError: "打开失败，点击重试"
		};
		/** English dictionary with the same keys as the Chinese dictionary. */
		const en = {
			chip: "Dashboard",
			guideTitle: "Dashboard",
			guideDescription: "Analytics dashboard pane; opens automatically after render_dashboard",
			placeholderPage: "Dashboard plugin loaded. Analytics dashboards rendered by render_dashboard appear here.",
			loading: "Reading the dashboard…",
			failed: "Could not read the dashboard file: {reason}",
			frame: "Analytics dashboard",
			refresh: "Refresh",
			reveal: "Open in file manager",
			revealing: "Opening…",
			revealed: "Opened",
			revealError: "Could not open; click to retry"
		};
		//#endregion
		//#region lib/types/client/index.js
		/** Stable identity: the tab-system key this package's registrations share. */
		const ID = "dsh-dashboard-ai";
		/** The tab kind this package owns. */
		const KIND = "dashboard";
		/** This package's copy namespace. */
		const NS = "dashboard";
		/**
		 * Required browser services: the slot registry, copy, the tab type
		 * registry, the navigation controller, the Remote carrier with its
		 * `workspaceFiles` namespace, and the conversation event registry.
		 */
		const inject = [
			"slots",
			"locale",
			"sidebarRightTabs",
			"sidebarRight",
			"remote",
			"remote.workspaceFiles",
			"uiConversation"
		];
		/**
		 * The dashboard tab type's registry definition.
		 * @returns the definition to register.
		 */
		function dashboardDefinition() {
			return {
				id: ID,
				kind: KIND,
				patterns: ["dsh-resource://dashboard/**"],
				title: () => "指标看板",
				guide: [{
					id: "dashboard",
					title: () => "指标看板",
					description: () => "分析看板面板：render_dashboard 渲染完成后自动展示",
					order: 50
				}]
			};
		}
		/**
		 * Client plugin body: dictionaries, the tab type, its body and chip
		 * title, and the rendered-event listener that auto-opens the tab.
		 * @param ctx - client root context carrying the registries.
		 */
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dashboard: dictionaries");
			ctx.effect(() => ctx.sidebarRightTabs.register(dashboardDefinition()), "dashboard: tab type");
			ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
				name: "sidebar.right.pane.tab",
				key: ID,
				locale: NS,
				inject: () => ({
					readDashboard: (sessionId, path, signal) => ctx.remote.workspaceFiles.readAll(sessionId, path, signal),
					useDashboardRender: (key) => react.useSyncExternalStore(subscribeRenders, () => renderSnapshotOf(key))
				})
			}, DashboardBody)), "dashboard: tab body");
			ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab.title", () => ctx.slots.register({
				name: "sidebar.right.pane.tab.title",
				key: ID,
				locale: NS
			}, DashboardTitle)), "dashboard: tab title");
			const activatedAt = Date.now();
			ctx.effect(() => ctx.uiConversation.events.register(dashboardEventDefinition(activatedAt, (sessionId, path) => {
				ctx.sidebarRight.openResourceIn(sessionId, dashboardAddress(sessionId, path));
			})), "dashboard: rendered listener");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

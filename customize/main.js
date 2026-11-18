// Cards: cmux's Cards New Tab page as a look. One rounded field, the project and the agent under
// it, then "Chats" and the three most recent chats as cards (the agent, the age, the title and the
// last reply, or what the chat waits on).
//
// Built only on the public customization API: cmux.newtab/1 draws the page once
// tabs.newTabApp names this app (cmux-setup.json sets it). Reads: agent_chat:read (granted at
// install). Clicks: actions:run (start a chat, open one) and workspace:write (show a chat's
// workspace), turned on in Settings > Apps > My views.

const RECENT = 3
const MINUTE = 60 * 1000

const [chats, setChats] = signal([])
const [loaded, setLoaded] = signal(false)
const [error, setError] = signal(null)
const [now, setNow] = signal(Date.now())
const [draft, setDraft] = signal("")
const [agents, setAgents] = signal([])
const [agent, setAgent] = signal(null)

const message = (e) => (e instanceof Error ? e.message : (e && e.message) || String(e))
const lastActivity = (c) => Math.max(c.updated_ms || 0, c.since_ms || 0, c.created_ms || 0)

// The recent chats, newest first. A host with server-side reads (limit) cuts and orders them; an
// older one answers every chat, which this look then orders and cuts itself.
let hostCuts = true
async function readRecent() {
  if (hostCuts) {
    try {
      const page = await cmux.call("agent_chat.list", { limit: RECENT })
      return page.chats.slice(0, RECENT)
    } catch (e) {
      if (!/param/i.test(message(e))) throw e
      hostCuts = false
    }
  }
  const all = (await cmux.call("agent_chat.list", {})).chats
  return all.sort((a, b) => lastActivity(b) - lastActivity(a)).slice(0, RECENT)
}

// One read at a time; a change during a read reads once more after it.
let reading = false
let again = false
async function load() {
  if (reading) return void (again = true)
  reading = true
  try {
    setChats(await readRecent())
    setNow(Date.now())
    setError(null)
  } catch (e) {
    setError(message(e))
  } finally {
    reading = false
    setLoaded(true)
    if (again) {
      again = false
      load()
    }
  }
}

async function loadAgents() {
  try {
    const list = await cmux.call("agent_cli.list", {})
    const rows = (Array.isArray(list) ? list : list.agents || list.clis || []).filter((a) => a && a.id)
    if (rows.length) setAgents(rows.map((a) => ({ id: a.id, name: a.name || a.title || a.id })))
  } catch {
    // No agent list: the field starts the agent cmux starts by default.
  }
}

// "now", "4m", "2h", "3d", as cmux's cards count.
function age(ms) {
  if (!ms) return ""
  const minutes = Math.round((now() - ms) / MINUTE)
  if (minutes < 1) return "now"
  if (minutes < 60) return `${minutes}m`
  const hours = Math.round(minutes / 60)
  return hours < 24 ? `${hours}h` : `${Math.round(hours / 24)}d`
}

// What a card says under its title: what the chat waits on, else its last reply.
function cardMessage(c) {
  if (c.state === "input") return { text: "Needs your input", tone: "warning" }
  if (c.state === "failed" || c.state === "lost") return { text: c.error || "Failed", tone: "danger" }
  if (c.state === "working") return { text: c.step || "Working", tone: "secondary" }
  const text = c.preview || c.step || ""
  return text ? { text, tone: "secondary" } : null
}

// The agent's mark: its own logo where the host has one, else the chat glyph.
const markOf = (harness) => (harness === "codex" ? "terminal" : "sparkle")

const folderName = (cwd) => (cwd || "").replace(/\/+$/, "").split("/").pop() || "No project"

async function start() {
  const text = draft().trim()
  if (!text) return
  try {
    await cmux.actions.run("newTab.submit", agent() ? { text, agent: agent() } : { text })
    setDraft("")
  } catch (e) {
    cmux.toast({ title: "Cannot start the chat", message: message(e), tone: "warning" })
  }
}

async function open(chat) {
  try {
    if (chat.workspace) await cmux.workspace.focus({ workspace: chat.workspace })
    else await cmux.actions.run("agent.openSessionTab", { session: chat.id })
  } catch (e) {
    cmux.toast({ title: "Cannot open the chat", message: message(e), tone: "warning" })
  }
}

// The field: one rounded pill with the prompt and Send.
function field() {
  return Panel({ style: "card" }, [
    HStack({ spacing: 8 }, [
      TextField(draft, { placeholder: "Ask anything", autofocus: true, onEdit: setDraft, onSubmit: start }).font(15),
      Button(Icon("arrow.up").size(13), start)
        .frame({ width: 32, height: 32 })
        .cornerRadius(16)
        .background(() => (draft().trim() ? "primary" : "hover"))
        .color(() => (draft().trim() ? "#FFFFFF" : "tertiary"))
        .help("Send")
    ])
      .paddingHorizontal(14)
      .frame({ minHeight: 40 })
  ])
    .cornerRadius(28)
}

// Under the field: the project the chat starts in, and the agent.
function chips(ctx) {
  const agentTitle = () => {
    const picked = agents().find((a) => a.id === agent())
    return picked ? picked.name : "Agent"
  }
  return HStack({ spacing: 12 }, [
    HStack({ spacing: 5 }, [Icon("folder").size(12).color("tertiary"), Text(folderName(ctx.cwd)).font("caption").color("secondary").lineLimit(1)])
      .help(ctx.cwd || "No project"),
    Spacer(),
    () =>
      agents().length
        ? Menu(agentTitle, agents().map((a) => Button(a.name, () => setAgent(a.id))))
            .font("caption")
            .color("secondary")
        : null
  ]).paddingHorizontal(20)
}

function card(chat) {
  const msg = () => cardMessage(chat())
  return Panel({ style: "card", spacing: 4 }, [
    HStack({ spacing: 4 }, [
      Icon(() => markOf(chat().harness)).size(14).color("tertiary"),
      Text(() => age(lastActivity(chat()))).font("caption").color("tertiary").monospaced(),
      Spacer()
    ]),
    Text(() => chat().title).font(15).weight("semibold").color("primary").lineLimit(1),
    () => (msg() ? Text(() => (msg() || {}).text || "").font(13).color(() => (msg() || {}).tone || "secondary").lineLimit(9) : null),
    Spacer()
  ])
    .cornerRadius(14)
    .frame({ maxWidth: "infinity", minHeight: 84 })
    .cursor("pointer")
    .help(() => [chat().title, chat().cwd, chat().harness].filter(Boolean).join("\n"))
    .onTap(() => open(chat()))
    .contextMenu([Button("Open", () => open(chat())), Button("Open in New Tab", () => cmux.actions.run("agent.openSessionTab", { session: chat().id }))])
}

// "Chats" as a pill tab, All Chats across from it, then three cards in a row.
function recent() {
  return VStack({ spacing: 16, alignment: "leading" }, [
    HStack({ spacing: 12 }, [
      Text("Chats").font(13).weight("semibold").color("primary").paddingHorizontal(16).paddingVertical(4).background("hover").cornerRadius(999),
      Spacer(),
      Button(HStack({ spacing: 2 }, [Text("All Chats").font("caption"), Icon("chevron.right").size(10)]), () =>
        cmux.actions.run("search.chats").catch((e) => cmux.toast({ title: "Cannot show all chats", message: message(e), tone: "warning" }))
      ).color("tertiary")
    ]).frame({ height: 34 }),
    () => {
      if (error()) return EmptyState({ title: "Cannot read your chats", message: error(), symbol: "exclamationmark.triangle" })
      if (!loaded()) return null
      if (chats().length === 0) return Text("No chats yet").font(13).color("tertiary")
      return null
    },
    () =>
      loaded() && !error() && chats().length
        ? HStack({ spacing: 16, alignment: "top" }, [
            ForEach({ items: chats, key: (c) => c.id }, card),
            // Empty columns keep a lone card one third wide, as cmux's grid does.
            () => Group(Array.from({ length: RECENT - chats().length }, () => Rectangle().fill("#00000000").frame({ maxWidth: "infinity", height: 1 })))
          ])
        : null
  ])
}

function renderNewTab(ctx) {
  ctx = ctx || {}
  load()
  loadAgents()
  // The app tells the daemon when a chat changes: read again then, never on a timer. Only the
  // ages tick.
  cmux.events.on("agent_chat.changed", load)
  cmux.timer.every(30000, () => setNow(Date.now()))
  return VStack({ spacing: 12, alignment: "leading" }, [field(), chips(ctx), recent().padding({ top: 24 })]).padding({ top: 24 })
}

globalThis.__cmuxAppExports = { renderNewTab }

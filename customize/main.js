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

const needsYou = (c) => c.state === "input" || c.state === "failed" || c.state === "lost"
const need = (c) => (c.state === "input" ? 0 : needsYou(c) ? 1 : 2)
// As cmux's cards order them: the chats that need you first (needs input, then failed), then the
// rest newest first.
const byNeed = (list) => [...list].sort((a, b) => need(a) - need(b) || lastActivity(b) - lastActivity(a))

// The three cards. A host with server-side reads (limit, state) cuts and orders the recent chats
// and the ones that need you; an older one answers every chat, which this look orders and cuts.
let hostCuts = true
async function readRecent() {
  if (hostCuts) {
    try {
      const [recent, waiting] = await Promise.all([
        cmux.call("agent_chat.list", { limit: RECENT }),
        cmux.call("agent_chat.list", { limit: RECENT, state: ["input", "failed", "lost"] })
      ])
      const first = waiting.chats.filter(needsYou)
      return byNeed([...first, ...recent.chats.filter((c) => !first.some((w) => w.id === c.id))]).slice(0, RECENT)
    } catch (e) {
      if (!/param/i.test(message(e))) throw e
      hostCuts = false
    }
  }
  return byNeed((await cmux.call("agent_chat.list", {})).chats).slice(0, RECENT)
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

// What a card says under its title, as cmux's cards do: the state when the chat is not idle, else
// its last reply.
function cardMessage(c) {
  if (c.state === "input") return { text: "Needs input", tone: "warning" }
  if (c.state === "failed" || c.state === "lost") return { text: "Failed", tone: "danger" }
  if (c.state === "working") return { text: "Running", tone: "secondary" }
  if (c.unread) return { text: "Unread", tone: "secondary" }
  return c.preview ? { text: c.preview, tone: "secondary" } : null
}

// The agent's mark. Scene icons are cmux's icon pack, which has no agent logos yet (GAPS.md), so
// every agent gets the chat glyph.
const markOf = () => "agent.chat"

const folderName = (cwd) => (cwd || "").replace(/\/+$/, "").split("/").pop() || "No folder"

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
    HStack({ spacing: 12 }, [
      Icon("action.add").size(16).color("secondary"),
      TextField(draft, { placeholder: "Ask anything or type a URL", autofocus: true, onEdit: setDraft, onSubmit: start })
        .font(15)
        .frame({ maxWidth: "infinity" }),
      Spacer(),
      Button(Icon("composer.send").size(15), start)
        .frame({ width: 30, height: 30 })
        .cornerRadius(15)
        .background(() => (draft().trim() ? "primary" : "#00000000"))
        .color(() => (draft().trim() ? "#FFFFFF" : "secondary"))
        .help("Send")
    ])
      .paddingHorizontal(16)
      .frame({ minHeight: 36 })
  ])
    .cornerRadius(999)
}

// Over the field: the folder the chat starts in and the machine it runs on.
function place(ctx) {
  return HStack({ spacing: 20 }, [
    HStack({ spacing: 6 }, [Icon("folder").size(14).color("secondary"), Text(folderName(ctx.cwd)).font(14).color("secondary").lineLimit(1)])
      .help(ctx.cwd || "No folder"),
    HStack({ spacing: 6 }, [Icon("machine.local").size(14).color("secondary"), Text("This Mac").font(14).color("secondary")]),
    Spacer()
  ]).paddingHorizontal(18)
}

// Under the field: the agent the chat starts with.
function footer() {
  const agentTitle = () => {
    const picked = agents().find((a) => a.id === agent())
    return picked ? picked.name : "Agent"
  }
  return HStack({ spacing: 12 }, [
    Spacer(),
    () =>
      agents().length
        ? Menu(agentTitle, agents().map((a) => Button(a.name, () => setAgent(a.id))))
            .font(14)
            .color("secondary")
        : null
  ]).paddingHorizontal(28)
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
      Button(HStack({ spacing: 4 }, [Text("All Chats").font(13), Icon("nav.forward").size(11)]), () =>
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
  return VStack({ spacing: 12, alignment: "leading" }, [place(ctx), field(), footer(), recent().padding({ top: 56 })]).padding({ top: 32 })
}

globalThis.__cmuxAppExports = { renderNewTab }

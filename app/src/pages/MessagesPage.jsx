// Moved out of Marketplace.jsx unchanged; see that file's history for the
// reasoning in the comments below.
import { useState, useEffect, useRef, lazy } from "react";
import * as remote from "../backend/remote.js";
import Icon from "../icons/Icon.jsx";
import * as convo from "../data/conversations.js";
import * as offers from "../data/offers.js";
import { t, getLang } from "../i18n/t.js";
import { space } from "../theme/scale.js";
import { marginStart, marginEnd, alignEnd, money } from "../i18n/direction.js";
import { C, Avatar, TopBar, BackBtn, Placeholder } from "../market/shared.jsx";
const MeetSafely = lazy(() => import("../messages/MeetSafely.jsx"));
const MeetPlan = lazy(() => import("../meet/MeetPlan.jsx"));


// ── messages ───────────────────────────────────────────────────────────────
//
//  v2.8 — this screen used to be a puppet show.
//
//  Threads lived in React state and the other woman was a `setTimeout`: 1.2
//  seconds after you sent anything, a reply was drawn at random from
//  ["Thanks for reaching out!", "Yes, still available!", "Can you share your
//  size?"]. A buyer had a warm exchange with an array. The seller was never
//  told anybody had written to her.
//
//  The database has had real threads all along — one per piece, readable only
//  by the two participants, `anon` holding no grant at all, messages immutable
//  after sending, live delivery over a realtime channel. `backend/remote.js`
//  implements every call. Nothing in the interface used any of it.
//
//  It does now, through data/conversations.js, with the same local-first rule
//  as the rest of the app. With no backend configured a message is stored on
//  the device and plainly marked as not sent — because the one thing this
//  screen must never do again is answer on a seller's behalf.
export function MessagesPage({shops,items,onReport,openThreadId,onOpened,error,onOpenOffers}) {
  const [active,setActive] = useState(null);
  const [newMsg,setNewMsg] = useState("");
  const [threads,setThreads] = useState([]);
  const [thread,setThread] = useState([]);       // messages of the open thread
  const [sending,setSending] = useState(false);
  const [sendError,setSendError] = useState(null);
  const [safetyOpen,setSafetyOpen] = useState(true);
  const scrollRef = useRef();
  const liveThreads = convo.isRemote();   // named to avoid shadowing the `remote` module

  // ── normalising ──────────────────────────────────────────────────────────
  // v2.10 — there is now one shape, because there is one source. Threads used
  // to come from two places: the database on the remote path, and a `messages`
  // prop held in the root component's React state on the device path. The prop
  // is gone; conversations.js owns both paths and returns the same shape from
  // either, so this screen no longer has a branch that can disagree with
  // itself. A thread held on the device carries `local: true`, and that is the
  // only thing the screen needs to know.
  const asThread = (t, i) => ({
    key: t.id, id: t.id, shopId: t.shop_id, itemId: t.item_id,
    index: i, remote: !t.local,
  });

  // `delivered` is the honest field: false means it is sitting on this phone
  // and no one else has seen it. It is never assumed true for a message the
  // server has not acknowledged.
  const asMessage = (m, i) => ({
    key: m.id || i,
    mine: liveThreads ? m.sender_uid === myUid.current : m.sender_uid === "me",
    text: m.body, at: m.created_at,
    delivered: m.delivered !== false,
    read: !!m.read_at,
  });

  const myUid = useRef(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (liveThreads) myUid.current = await remote.currentUid();
        const list = await convo.getConversations();
        if (alive) setThreads(list || []);
      } catch (e) {
        console.warn("couldn't load conversations:", e && e.message);
      }
    })();
    return () => { alive = false; };
    // openThreadId is a dependency because a thread that was just created is
    // not in the list that was fetched before it existed. Without this the
    // buyer is sent to a screen that does not yet contain her conversation.
  }, [liveThreads, openThreadId]);

  // ── arriving from "Ask about these" ──────────────────────────────────────
  // The buyer tapped a button about one specific piece. Landing her on a list
  // of threads and asking her to find it again is the kind of small rudeness
  // that reads as the app not knowing what she just did. Once the thread she
  // asked for is in the list, open it.
  useEffect(() => {
    if (!openThreadId || !threads.length) return;
    const i = threads.findIndex((t) => String(t.id) === String(openThreadId));
    if (i >= 0) { setActive(i); onOpened && onOpened(); }
  }, [openThreadId, threads]);

  // ── open thread: load, mark read, and listen ─────────────────────────────
  const openThread = threads[active] ? asThread(threads[active], active) : null;

  useEffect(() => {
    let alive = true, unsubscribe = null;
    setSendError(null);
    if (!openThread) { setThread([]); return; }
    (async () => {
      // One call for both paths — conversations.js reads the device store when
      // there is no backend, so the screen no longer reaches into a raw thread
      // object to find messages by two possible property names.
      const msgs = await convo.getMessages(openThread.id);
      if (!alive) return;
      setThread(msgs);
      if (openThread.remote) {
        convo.markRead(openThread.id);
        unsubscribe = await convo.watchMessages(openThread.id, (m) => {
          setThread((prev) => prev.some((x) => x.id === m.id) ? prev : [...prev, m]);
          convo.markRead(openThread.id);
        });
      }
    })();
    return () => { alive = false; if (unsubscribe) unsubscribe(); };
  }, [openThread && openThread.key]);

  const send = async () => {
    const text = newMsg.trim();
    if (!text || sending || !openThread) return;
    setSending(true); setSendError(null);
    try {
      const saved = await convo.sendMessage(openThread.id, text);
      setNewMsg("");
      // The realtime channel echoes our own insert back; adding it here too
      // would double it, so on the remote path we let the channel deliver.
      if (!openThread.remote) setThread((prev) => [...prev, saved]);
    } catch (e) {
      if (e && e.code === "HELD_OFFLINE") {
        setNewMsg("");
        if (e.held) setThread((prev) => [...prev, e.held]);
      }
      setSendError(e && e.message ? e.message : "That didn't send. Try again.");
    } finally {
      setSending(false);
    }
  };

  useEffect(()=>{if(scrollRef.current)scrollRef.current.scrollTop=scrollRef.current.scrollHeight;},[thread,active]);

  const timeLabel = (at) => {
    if (!at) return "";
    if (typeof at === "string" && !/^\d{4}-/.test(at)) return at;   // device demo threads
    const d = new Date(at);
    if (isNaN(d)) return "";
    const mins = Math.round((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return "now";
    if (mins < 60) return `${mins}m`;
    if (mins < 1440) return `${Math.round(mins / 60)}h`;
    return d.toLocaleDateString();
  };

  if(active!==null && openThread) {
    const shop = shops.find(s=>s.id===openThread.shopId);
    const item = items.find(i=>i.id===openThread.itemId);
    const view = thread.map(asMessage);
    return (
      <div style={{display:"flex",flexDirection:"column",height:"100vh",paddingBottom:0}}>
        <TopBar left={<BackBtn onBack={()=>setActive(null)}/>}
          center={<div style={{textAlign:"center"}}>
            <div style={{fontSize:13,fontWeight:700,color:C.ink}}>{shop?.name||"Seller"}</div>
            {/* Was "Online"/"Offline" against a boolean nothing maintained.
                The piece the two of you are talking about is both true and
                more useful at the top of a thread. */}
            <div style={{fontSize:11,color:C.inkLt,maxWidth:170,whiteSpace:"nowrap",
              overflow:"hidden",textOverflow:"ellipsis"}}>{item?.title||shop?.handle||""}</div>
          </div>}
          right={
            /* v2.8 — reporting from inside the thread. Harassment happens in
               the conversation, and asking someone to leave it, find the shop
               and report from there is asking most people not to bother. */
            <button
              onClick={()=>onReport && onReport({kind:"conversation",
                id:openThread.id, title:shop?.name||"this conversation",
                shopId:openThread.shopId, shopName:shop?.name})}
              aria-label="Report this conversation"
              className="tap-target"
              style={{background:"none",border:"none",cursor:"pointer",color:C.inkLt,
                display:"flex",alignItems:"center",padding:4}}>
              <Icon name="warning" size={16} stroke={2}/>
            </button>}/>
        {item && (
          <div style={{display:"flex",gap:10,padding:"10px 14px",background:C.white,borderBottom:`1px solid ${C.border}`}}>
            <div style={{width:44,height:44,borderRadius:8,overflow:"hidden",flexShrink:0,
              background:`linear-gradient(145deg,${item.color},${item.color}99)`,
              display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>
              {item.photo?<img src={item.photo} style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<Placeholder item={item} size={40}/>}
            </div>
            <div>
              <div style={{fontSize:13,fontWeight:600,color:C.ink}}>{item.title}</div>
              <div style={{fontSize:11,color:C.terraTx,fontWeight:700}}>{money(item.price)}</div>
            </div>
          </div>
        )}
        {safetyOpen && <MeetSafely onDismiss={()=>setSafetyOpen(false)}/>}
        {/* v2.9. MeetSafely says the right three things on a sheet she has to
            open, which makes it a disclaimer rather than a safety feature. The
            meet is now a thing in the thread that both of them agree to — see
            meet/MeetPlan.jsx, and meet/places.js for why nothing here claims a
            location is verified. */}
        <div style={{padding:"10px 14px 0"}}>
          <MeetPlan conversationId={openThread.id} itemId={item&&item.id}
            onReport={()=>onReport && onReport({kind:"conversation",
              id:openThread.id, title:shop?.name||"this conversation",
              shopId:openThread.shopId, shopName:shop?.name})}/>
        </div>
        <div ref={scrollRef} style={{flex:1,overflowY:"auto",padding:"14px",display:"flex",flexDirection:"column",gap:10}}>
          {view.length===0 && (
            <div style={{textAlign:"center",color:C.inkLt,fontSize:12,padding:"24px 12px",lineHeight:1.6}}>
              Nothing here yet. Say hello — sellers reply faster to a real
              question than to "is this available".
            </div>
          )}
          {view.map((m)=>(
            <div key={m.key} style={{display:"flex",justifyContent:m.mine?"flex-end":"flex-start"}}>
              {!m.mine && <Avatar shop={shop||{}} size={28}/>}
              {/* v2.9.1. This was marginLeft/marginRight, so under dir="rtl"
                  every message aligned to the wrong side and your own became
                  indistinguishable from hers. Of all the RTL faults in the app
                  this was the one that stopped a screen meaning anything. */}
              <div style={{maxWidth:"72%",
                ...(m.mine ? marginEnd(0) : marginStart(8)),
                ...(m.mine ? marginStart(0) : marginEnd(8)),
                background:m.mine?C.terra:C.white,
                color:m.mine?C.white:C.ink,
                borderRadius:m.mine?"18px 18px 4px 18px":"18px 18px 18px 4px",
                padding:"10px 14px",fontSize:13,lineHeight:1.45,
                border:m.mine?"none":`1px solid ${C.border}`}}>
                {m.text}
                <div style={{fontSize:11,opacity:0.6,marginTop:4,textAlign:alignEnd()}}>
                  {timeLabel(m.at)}
                  {m.mine && m.delivered === false && " · not sent"}
                  {m.mine && m.delivered !== false && m.read && " · read"}
                </div>
              </div>
            </div>
          ))}
        </div>
        {sendError && (
          <div role="alert" style={{padding:"8px 14px",background:"#FBF0EE",
            borderTop:`1px solid ${C.red}`,fontSize:12,color:C.ink,lineHeight:1.5}}>
            {sendError}
          </div>
        )}
        <div style={{padding:"10px 14px 14px",background:C.white,borderTop:`1px solid ${C.border}`,display:"flex",gap:10}}>
          <input value={newMsg} onChange={e=>setNewMsg(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&send()}
            maxLength={2000}
            aria-label="Type a message"
            placeholder={t("type_a_message")}
            style={{flex:1,padding:"10px 14px",borderRadius:24,border:`1px solid ${C.border}`,
              fontSize:13,outline:"none",fontFamily:"inherit"}}/>
          <button className="tap-round" onClick={send} disabled={sending||!newMsg.trim()}
            aria-label="Send message"
            style={{background:(sending||!newMsg.trim())?C.sand:C.btn,
              color:(sending||!newMsg.trim())?C.inkLt:C.onBtn,border:"none",
              borderRadius:"50%",width:44,height:44,cursor:sending?"default":"pointer",
              display:"flex",alignItems:"center",justifyContent:"center"}}>
            <Icon name="send" size={17} stroke={2}/>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{paddingBottom:72}}>
      <TopBar center={<span style={{fontFamily:"Georgia,serif",fontStyle:"italic",fontSize:18,color:C.terraTx}}>{t("messages")}</span>}
        right={onOpenOffers && <button onClick={onOpenOffers} style={{background:"none",border:`1.5px solid ${C.terra}`,
          color:C.terraTx,borderRadius:20,padding:"6px 12px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",
          display:"inline-flex",alignItems:"center",gap:5}}><Icon name="handshake" size={14}/>{t("offers")}</button>}/>
      {/* A conversation that could not be opened — a seller who has blocked
          you, a beta gate you are not part of — is said out loud. The old
          local-state path could not fail, so it never had to say anything;
          a real one can, and silence would leave her tapping a button that
          appears to do nothing. */}
      {error && <div style={{margin:"12px 14px",padding:"12px 12px",background:C.white,
        border:`1.5px solid ${C.red}`,borderRadius:12,fontSize:13,color:C.ink,
        lineHeight:1.55}}>{error}</div>}
      {threads.length===0
        ? <div style={{textAlign:"center",padding:"80px 20px",color:C.inkLt}}>
            <Icon name="chat" size={38} stroke={1.6} style={{color:C.terra,marginBottom:14}}/>
            <div style={{fontFamily:"Georgia,serif",fontStyle:"italic",fontSize:16,color:C.terraTx}}>No messages yet</div>
            <div style={{fontSize:12,marginTop:6}}>{getLang()==="ar" ? "راسلي أي بائعة من صفحة القطعة" : "Message a seller from any listing"}</div>
          </div>
        : <div>
            {threads.map((raw,i)=>{
              const t=asThread(raw,i);
              const shop=shops.find(s=>s.id===t.shopId);
              const item=items.find(it=>it.id===t.itemId);
              // v2.10 — this read `raw.last_body`. The column is `last_message`,
              // written by the touch_conversation trigger, so every preview on
              // the server path was an empty string and every thread in the
              // list looked like it had nothing in it. One source now, one
              // shape, and the device fallback fills the same two fields.
              const last = (raw.msgs||[])[(raw.msgs||[]).length-1];
              const preview = raw.last_message || (last && last.body) || "";
              const when = raw.last_at || (last && last.created_at) || "";
              return (
                <div key={t.key} onClick={()=>setActive(i)}
                  style={{display:"flex",gap:12,padding:"14px",borderBottom:`1px solid ${C.border}`,cursor:"pointer"}}>
                  <Avatar shop={shop||{}} size={48}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
                      <span style={{fontWeight:700,fontSize:13,color:C.ink}}>{shop?.name||"Seller"}</span>
                      <span style={{fontSize:11,color:C.inkLt}}>{timeLabel(when)}</span>
                    </div>
                    <div style={{fontSize:12,color:C.inkLt,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{preview}</div>
                    {item&&<div style={{fontSize:11,color:C.terraTx,marginTop:3,fontWeight:500}}>{item.title}</div>}
                  </div>
                </div>
              );
            })}
          </div>}
    </div>
  );
}

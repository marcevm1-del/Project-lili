import { C } from "../compliance/ui.js";
import { money } from "../i18n/direction.js";

// The price, and — when she has lowered it — what it was. The database keeps
// `previous_price` for the price-drop alert; showing it on the piece itself is
// how every resale app tells a buyer the seller is ready to move.
export default function PriceTag({item, size=14}) {
  const was = Number(item.previousPrice);
  const dropped = was > 0 && was > Number(item.price);
  return (
    <span style={{display:"inline-flex",alignItems:"baseline",gap:5,flexWrap:"wrap",minWidth:0}}>
      <span style={{color:C.terraTx,fontWeight:800,fontSize:size,whiteSpace:"nowrap"}}>{money(item.price)}</span>
      {dropped && <s aria-label={`was ${money(was)}`} style={{color:C.inkLt,fontSize:Math.round(size*0.72),whiteSpace:"nowrap"}}>{money(was)}</s>}
    </span>
  );
}

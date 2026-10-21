"use client";

import { PRODUCT_LABEL, type MkState } from "@/lib/marketersApi";
import { SignupActions } from "./SignupActions";
import { Field, H2, Notice, Panel, TextInput } from "./ui";

export function InviteTab({ state, phone, setPhone }: { state: MkState; phone: string; setPhone: (v: string) => void }) {
  return (
    <div className="space-y-4">
      <H2>Invite customers</H2>
      <Panel>
        <Field label="Customer phone number" hint="Needed to send the link by WhatsApp or SMS. Gambian mobile, e.g. 3XXXXXX or +220 87X XXX XXX">
          <TextInput value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="off" />
        </Field>
      </Panel>
      <div className="grid gap-3 sm:grid-cols-2">
        {state.links.map((l) => (
          <Panel key={l.id} className="space-y-3">
            <div>
              <p className="font-bold text-[#0b2a5b]">{l.label}</p>
              <p className="text-xs text-slate-500">{PRODUCT_LABEL[l.product]} sign-up website</p>
            </div>
            <SignupActions link={l} phone={phone} />
          </Panel>
        ))}
      </div>
      <Notice>
        You can help the customer open the website, but they type their own password and verification codes — never ask for them.
        Opening, copying or sending a link does not create an account or mark the customer as verified.
      </Notice>
      <Notice tone="amber">
        These standard links do not track who referred the customer. Add the customer under Customers first, then share the link: a
        signup after you record the number is verified as yours. Signups recorded afterwards go to the owner for review.
      </Notice>
    </div>
  );
}

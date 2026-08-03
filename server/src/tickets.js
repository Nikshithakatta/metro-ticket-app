import crypto from "crypto";

const SECRET = process.env.TICKET_HMAC_SECRET || "metrocity-demo-secret-change-me";

export function signTicket(ticketId, validTo) {
  return crypto
    .createHmac("sha256", SECRET)
    .update(`${ticketId}|${validTo}`)
    .digest("hex");
}

export function verifyTicketSignature(ticketId, validTo, signature) {
  const expected = signTicket(ticketId, validTo);
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(signature, "hex")
    );
  } catch {
    return false;
  }
}

export function buildQrPayload(ticket) {
  return JSON.stringify({
    tid: ticket.id,
    bid: ticket.booking_id,
    typ: ticket.ticket_type,
    exp: ticket.valid_to,
    sh: ticket.share_token,
    sig: ticket.signature,
  });
}

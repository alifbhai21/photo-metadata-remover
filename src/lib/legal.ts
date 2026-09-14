export interface LegalIdentity {
  name: string;
  address: string;
  email: string;
  representative?: string;
  vat?: string;
}

const legalName = import.meta.env.PUBLIC_LEGAL_NAME as string | undefined;
const legalAddress = import.meta.env.PUBLIC_LEGAL_ADDRESS as string | undefined;
const legalEmail = import.meta.env.PUBLIC_LEGAL_EMAIL as string | undefined;
const legalRepresentative = import.meta.env.PUBLIC_LEGAL_REPRESENTATIVE as string | undefined;
const legalVat = import.meta.env.PUBLIC_LEGAL_VAT as string | undefined;

export function getLegalIdentity(): LegalIdentity {
  const name = (legalName ?? '').trim();
  const address = (legalAddress ?? '').trim();
  const email = (legalEmail ?? '').trim();
  const representative = (legalRepresentative ?? '').trim();
  const vat = (legalVat ?? '').trim();

  const identity: LegalIdentity = { name, address, email };
  if (representative) identity.representative = representative;
  if (vat) identity.vat = vat;
  return identity;
}

export function isLegalConfigured(): boolean {
  const { name, address, email } = getLegalIdentity();
  return Boolean(name && address && email);
}
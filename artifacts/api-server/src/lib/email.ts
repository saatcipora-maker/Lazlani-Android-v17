import { logger } from "./logger";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export class EmailDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailDeliveryError";
  }
}

export async function sendPasswordResetEmail(
  email: string,
  code: string,
  expiresInMinutes: number,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    throw new EmailDeliveryError(
      "E-posta gönderimi yapılandırılmamış. RESEND_API_KEY ve RESEND_FROM_EMAIL gerekli.",
    );
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "LAZLANI şifre yenileme kodunuz",
      text: [
        "LAZLANI hesabınız için şifre yenileme isteği aldık.",
        "",
        `Doğrulama kodunuz: ${code}`,
        `Bu kod ${expiresInMinutes} dakika içinde ve yalnızca bir kez kullanılabilir.`,
        "",
        "Bu isteği siz yapmadıysanız bu e-postayı yok sayabilirsiniz.",
      ].join("\n"),
      html: `<p>LAZLANI hesabınız için şifre yenileme isteği aldık.</p><p><strong>Doğrulama kodunuz: ${code}</strong></p><p>Bu kod ${expiresInMinutes} dakika içinde ve yalnızca bir kez kullanılabilir.</p><p>Bu isteği siz yapmadıysanız bu e-postayı yok sayabilirsiniz.</p>`,
    }),
  });

  if (!response.ok) {
    logger.warn({ statusCode: response.status }, "Password reset email provider rejected the request");
    throw new EmailDeliveryError("E-posta gönderilemedi. Lütfen biraz sonra tekrar deneyin.");
  }
}
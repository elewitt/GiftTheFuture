import { NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const { to, recipientName, senderName, marketTitle, side, shares, giftMessage, claimUrl } =
      await req.json();

    if (!to || !claimUrl) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Check if Resend is configured
    if (!process.env.RESEND_API_KEY) {
      console.log("[Email] Resend not configured, skipping email send");
      console.log("[Email] Would have sent to:", to);
      console.log("[Email] Claim URL:", claimUrl);
      return NextResponse.json({
        success: true,
        mock: true,
        message: "Email skipped (Resend not configured)",
      });
    }

    const { data, error } = await resend.emails.send({
      from: "Gift the Future <onboarding@resend.dev>", // Using Resend's test domain until you verify your own
      to: [to],
      subject: `${senderName || "Someone"} sent you a prediction market position!`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="margin: 0; padding: 0; background-color: #060a13; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
            <div style="max-width: 480px; margin: 0 auto; padding: 40px 20px;">
              <!-- Header -->
              <div style="text-align: center; margin-bottom: 32px;">
                <div style="display: inline-block; background: linear-gradient(135deg, #6366f1, #10b981); padding: 12px; border-radius: 16px; margin-bottom: 16px;">
                  <span style="font-size: 32px;">🎁</span>
                </div>
                <h1 style="color: #f1f5f9; font-size: 24px; font-weight: 700; margin: 0 0 8px;">
                  You received a gift!
                </h1>
                <p style="color: #64748b; font-size: 14px; margin: 0;">
                  ${senderName || "Someone"} sent you a stake in the future
                </p>
              </div>

              <!-- Gift Card -->
              <div style="background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(99, 102, 241, 0.2); border-radius: 16px; padding: 24px; margin-bottom: 24px;">
                <p style="color: #6366f1; font-size: 11px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; margin: 0 0 8px;">
                  PREDICTION MARKET
                </p>
                <h2 style="color: #f1f5f9; font-size: 18px; font-weight: 600; margin: 0 0 16px; line-height: 1.4;">
                  ${marketTitle}
                </h2>
                
                <div style="display: flex; justify-content: space-between; padding: 12px 0; border-top: 1px solid rgba(148, 163, 184, 0.1);">
                  <span style="color: #64748b; font-size: 14px;">Position</span>
                  <span style="color: ${side === "yes" ? "#34d399" : "#f87171"}; font-size: 14px; font-weight: 600;">
                    ${shares} x ${side?.toUpperCase() || "YES"}
                  </span>
                </div>
                
                <div style="display: flex; justify-content: space-between; padding: 12px 0; border-top: 1px solid rgba(148, 163, 184, 0.1);">
                  <span style="color: #64748b; font-size: 14px;">If correct</span>
                  <span style="color: #fbbf24; font-size: 14px; font-weight: 600;">
                    $${shares?.toFixed(2) || "0.00"} payout
                  </span>
                </div>
              </div>

              ${
                giftMessage
                  ? `
              <!-- Message -->
              <div style="background: rgba(99, 102, 241, 0.05); border-left: 3px solid #6366f1; padding: 16px; border-radius: 0 12px 12px 0; margin-bottom: 24px;">
                <p style="color: #c7d2fe; font-size: 14px; font-style: italic; margin: 0 0 8px; line-height: 1.5;">
                  "${giftMessage}"
                </p>
                <p style="color: #6366f1; font-size: 12px; margin: 0; font-weight: 500;">
                  - ${senderName || "Your friend"}
                </p>
              </div>
              `
                  : ""
              }

              <!-- CTA Button -->
              <div style="text-align: center; margin-bottom: 24px;">
                <a href="${claimUrl}" style="display: inline-block; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; font-size: 16px; font-weight: 700; text-decoration: none; padding: 16px 32px; border-radius: 12px;">
                  Claim Your Gift
                </a>
              </div>

              <!-- Footer -->
              <div style="text-align: center;">
                <p style="color: #334155; font-size: 12px; margin: 0 0 8px;">
                  No crypto wallet needed - we'll create one for you
                </p>
                <p style="color: #1e293b; font-size: 10px; margin: 0;">
                  Gift the Future - Powered by Kalshi
                </p>
              </div>
            </div>
          </body>
        </html>
      `,
    });

    if (error) {
      console.error("[Email] Resend error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, emailId: data?.id });
  } catch (error: any) {
    console.error("[/api/email/send] Error:", error);
    return NextResponse.json(
      { error: error.message || "Email send failed" },
      { status: 500 }
    );
  }
}

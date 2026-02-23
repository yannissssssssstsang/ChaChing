
/**
 * Gmail Service for StallMate
 */
import { Transaction, Language, ReceiptConfig } from '../types';

const getAccessToken = () => {
  return (window as any).google_access_token || localStorage.getItem('google_access_token');
};

/**
 * Robustly encodes a UTF-8 string to Base64URL for Gmail API.
 */
const base64urlEncode = (str: string) => {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
};

/**
 * Encodes header values using RFC 2047 to prevent garbled characters.
 */
const encodeMimeHeader = (text: string) => {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `=?utf-8?B?${btoa(binary)}?=`;
};

/**
 * Construct an RFC 2822 formatted email.
 */
const createMimeMessage = (to: string, subject: string, body: string, companyName: string) => {
  const encodedSubject = encodeMimeHeader(subject);
  const encodedFrom = encodeMimeHeader(companyName);

  // Note: Double CRLF (\r\n\r\n) is required between headers and body
  const headers = [
    `To: ${to}`,
    `From: ${encodedFrom} <me>`,
    `Subject: ${encodedSubject}`,
    'Content-Type: text/html; charset=utf-8',
    'MIME-Version: 1.0',
    '',
    '' // Extra newline for safety
  ];

  const email = headers.join('\r\n') + body;
  return base64urlEncode(email);
};

export const sendReceiptEmail = async (
  transaction: Transaction, 
  to: string, 
  lang: Language, 
  config?: ReceiptConfig
): Promise<{ success: boolean; error?: string }> => {
  const token = getAccessToken();
  if (!token) {
    return { success: false, error: 'NO_TOKEN' };
  }

  const companyName = config?.companyName || (lang === 'zh' ? '揸流攤' : 'StallMate');
  const subject = `Your receipt from ${companyName}`;
  
  const totalQuantity = transaction.items.reduce((acc, item) => acc + item.quantity, 0);

  const itemsHtml = transaction.items.map(item => `
    <tr style="border-bottom: 1px solid #edf2f7;">
      <td style="padding: 12px 0; color: #1a202c; font-size: 14px; font-weight: 500;">${item.name}</td>
      <td style="padding: 12px 0; color: #4a5568; font-size: 14px; text-align: center;">$${item.price.toFixed(1)}</td>
      <td style="padding: 12px 0; color: #4a5568; font-size: 14px; text-align: center;">${item.quantity}</td>
      <td style="padding: 12px 0; color: #1a202c; font-size: 14px; font-weight: 700; text-align: right;">$${(item.price * item.quantity).toFixed(1)}</td>
    </tr>
  `).join('');

  const logoHtml = config?.logo ? `
    <div style="margin-bottom: 16px;">
      <img src="${config.logo}" alt="Logo" style="max-height: 64px; width: auto; display: block; margin: 0 auto;" />
    </div>
  ` : '';

  const dateObj = new Date(transaction.timestamp);
  const formattedDate = dateObj.toLocaleDateString(lang === 'zh' ? 'zh-HK' : 'en-US', { day: '2-digit', month: 'short', year: 'numeric' });
  const formattedTime = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const socialHtml = (config?.instagram || config?.facebook) ? `
    <div style="margin-top: 12px; border-top: 1px dashed #edf2f7; pt: 12px;">
      <p style="margin: 0 0 8px; color: #a0aec0; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">Follow Us</p>
      <div style="display: flex; justify-content: center; gap: 16px;">
        ${config?.instagram ? `
          <a href="${config.instagram.startsWith('http') ? config.instagram : `https://instagram.com/${config.instagram.replace('@', '')}`}" style="color: #e1306c; text-decoration: none; font-size: 12px; font-weight: 600; display: inline-block; margin: 0 8px;">
            <img src="https://cdn-icons-png.flaticon.com/128/174/174855.png" width="12" height="12" style="vertical-align: middle; margin-right: 4px; border: 0;" />
            <span style="vertical-align: middle;">${config.instagram}</span>
          </a>
        ` : ''}
        ${config?.facebook ? `
          <a href="${config.facebook.startsWith('http') ? config.facebook : `https://facebook.com/${config.facebook}`}" style="color: #1877f2; text-decoration: none; font-size: 12px; font-weight: 600; display: inline-block; margin: 0 8px;">
            <img src="https://cdn-icons-png.flaticon.com/128/174/174848.png" width="12" height="12" style="vertical-align: middle; margin-right: 4px; border: 0;" />
            <span style="vertical-align: middle;">${config.facebook}</span>
          </a>
        ` : ''}
      </div>
    </div>
  ` : '';

  const body = `
    <div style="background-color: #f7fafc; padding: 40px 20px; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0;">
        <div style="padding: 32px; text-align: center; border-bottom: 1px solid #edf2f7;">
          ${logoHtml}
          <h1 style="margin: 0; color: #1a202c; font-size: 28px; font-weight: 800; letter-spacing: -0.025em;">${companyName}</h1>
          <div style="margin-top: 16px; color: #718096; font-size: 12px; line-height: 1.5;">
            ${config?.address ? `<p style="margin: 2px 0;">${config.address}</p>` : ''}
            <p style="margin: 2px 0;">
              ${config?.phone ? `Tel: ${config.phone}` : ''} 
              ${config?.phone && config?.email ? ' &bull; ' : ''}
              ${config?.email ? `Email: ${config.email}` : ''}
            </p>
          </div>
        </div>
        <div style="padding: 24px 32px; background-color: #fcfcfd; border-bottom: 1px solid #edf2f7;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="width: 33.3%;">
                <p style="margin: 0; color: #a0aec0; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">Date</p>
                <p style="margin: 4px 0 0; color: #2d3748; font-size: 13px; font-weight: 600;">${formattedDate}</p>
              </td>
              <td style="width: 33.3%; text-align: center;">
                <p style="margin: 0; color: #a0aec0; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">Time</p>
                <p style="margin: 4px 0 0; color: #2d3748; font-size: 13px; font-weight: 600;">${formattedTime}</p>
              </td>
              <td style="width: 33.3%; text-align: right;">
                <p style="margin: 0; color: #a0aec0; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">Payment</p>
                <p style="margin: 4px 0 0; color: #2d3748; font-size: 13px; font-weight: 600;">${transaction.paymentMethod}</p>
              </td>
            </tr>
          </table>
        </div>
        <div style="padding: 32px;">
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="border-bottom: 2px solid #edf2f7;">
                <th style="text-align: left; padding-bottom: 12px; color: #a0aec0; font-size: 10px; font-weight: 700; text-transform: uppercase;">Item</th>
                <th style="text-align: center; padding-bottom: 12px; color: #a0aec0; font-size: 10px; font-weight: 700; text-transform: uppercase;">Price</th>
                <th style="text-align: center; padding-bottom: 12px; color: #a0aec0; font-size: 10px; font-weight: 700; text-transform: uppercase;">Qty</th>
                <th style="text-align: right; padding-bottom: 12px; color: #a0aec0; font-size: 10px; font-weight: 700; text-transform: uppercase;">Total</th>
              </tr>
            </thead>
            <tbody>${itemsHtml}</tbody>
          </table>
        </div>
        <div style="padding: 32px; background-color: #2563eb; color: #ffffff;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td>
                <p style="margin: 0; opacity: 0.8; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">Total Items</p>
                <p style="margin: 4px 0 0; font-size: 18px; font-weight: 700;">${totalQuantity}</p>
              </td>
              <td style="text-align: right;">
                <p style="margin: 0; opacity: 0.8; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">Total Amount</p>
                <p style="margin: 4px 0 0; font-size: 32px; font-weight: 900;">$${transaction.total.toFixed(1)}</p>
              </td>
            </tr>
          </table>
        </div>
        <div style="padding: 24px; text-align: center; border-top: 1px solid #edf2f7;">
          <p style="margin: 0; color: #a0aec0; font-size: 11px; font-weight: 500;">ID: ${transaction.id}</p>
          <p style="margin: 8px 0 0; color: #4a5568; font-size: 12px; font-weight: 600;">
            ${lang === 'zh' ? '感謝您的惠顧！' : 'Thank you for your business!'}
          </p>
          ${socialHtml}
        </div>
      </div>
      <div style="text-align: center; margin-top: 24px;">
        <p style="color: #cbd5e0; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em;">Powered by StallMate</p>
      </div>
    </div>
  `;

  try {
    const raw = createMimeMessage(to, subject, body, companyName);
    
    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ raw })
    });

    if (response.ok) {
      return { success: true };
    } else {
      let errorMessage = 'API_ERROR';
      try {
        const errorData = await response.json();
        errorMessage = errorData.error?.message || errorMessage;
      } catch (e) {
        // Body might not be JSON
      }

      if (response.status === 401) {
        return { success: false, error: 'TOKEN_EXPIRED' };
      }
      return { success: false, error: errorMessage };
    }
  } catch (err: any) {
    console.error("Gmail fetch error:", err);
    return { success: false, error: err.message || 'NETWORK_ERROR' };
  }
};

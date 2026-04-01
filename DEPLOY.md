# Deploy stepoutside.app website

This site is static HTML/CSS and can be hosted on Vercel, Netlify, Cloudflare Pages, GitHub Pages, or S3/CloudFront.

## Quickest path (Vercel)

1. Put this folder in a git repo.
2. Push to GitHub.
3. In Vercel: **Add New Project** → import repo.
4. Framework preset: **Other** (static).
5. Build command: *(none)*
6. Output directory: `.`
7. Deploy.
8. In Vercel project settings → **Domains** → add `stepoutside.app` and `www.stepoutside.app`.
9. At your domain registrar, update DNS records Vercel asks for (usually A/CNAME).

## DNS basics

- Root domain (`stepoutside.app`): A record(s) or ALIAS/ANAME depending on host
- `www`: CNAME to your host target

## SSL

Most hosts auto-provision SSL. Ensure both `https://stepoutside.app` and `https://www.stepoutside.app` resolve.

## App Store fields

Use these URLs in App Store Connect:
- Privacy Policy URL: `https://stepoutside.app/privacy-policy`
- Support URL: `https://stepoutside.app/contact.html`
- Terms of Use URL: `https://stepoutside.app/terms`
- Marketing URL (optional): `https://stepoutside.app/`

## Local preview

From this folder run:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

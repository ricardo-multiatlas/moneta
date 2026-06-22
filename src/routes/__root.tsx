import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { AuthProvider } from "@/hooks/use-auth";
import { PermissionsProvider } from "@/hooks/use-permissions";
import { DialogProvider } from "@/components/app/dialog-provider";
import { PwaRegister } from "@/components/app/pwa-register";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

const SITE_URL = "https://tanstack-start-app.makeflowia.workers.dev";
const OG_IMAGE = `${SITE_URL}/moneta-logo.png`;

const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#provider`,
      name: "MultiAtlas",
      url: "https://multiatlas.net",
      description: "Desarrollo de software a medida y SaaS para empresas en España.",
    },
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#cliente`,
      name: "Moneta Seguros",
      description: "Correduría de seguros con sede en Sevilla, España.",
      address: {
        "@type": "PostalAddress",
        addressLocality: "Sevilla",
        addressCountry: "ES",
      },
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE_URL}/#software`,
      name: "Moneta · Correduría OS",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description: "CRM + ERP a medida con IA para corredurías de seguros. Gestión de clientes, pólizas, vencimientos, comisiones, captación, facturación y comunicaciones.",
      url: SITE_URL,
      provider: { "@id": `${SITE_URL}/#provider` },
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "EUR",
      },
      featureList: [
        "Gestión de clientes con ficha 360°",
        "Alta de pólizas por extracción IA desde PDF",
        "Calendario de vencimientos con avisos automáticos",
        "Conciliación automática de comisiones de aseguradoras",
        "Pipeline de captación kanban",
        "Constructor visual de reportes",
        "Dashboard personalizable por usuario",
        "Audit log de cambios con captura de IP",
        "Multi-rol con Row Level Security",
      ],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: "Moneta · Correduría OS",
      publisher: { "@id": `${SITE_URL}/#provider` },
      inLanguage: "es-ES",
    },
  ],
};

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Correduría OS · Moneta Seguros" },
      { name: "description", content: "CRM + ERP a medida con IA para corredurías de seguros. Clientes, pólizas, vencimientos, comisiones y facturación en un solo lugar." },
      { name: "author", content: "MultiAtlas" },
      { name: "keywords", content: "correduría seguros, CRM seguros, ERP corredor, software corredor de seguros, gestión pólizas, comisiones aseguradoras, Sevilla, España" },
      { property: "og:site_name", content: "Moneta · Correduría OS" },
      { property: "og:title", content: "Correduría OS · Moneta Seguros" },
      { property: "og:description", content: "El sistema interno que merece una correduría moderna en 2026." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: SITE_URL },
      { property: "og:image", content: OG_IMAGE },
      { property: "og:image:width", content: "512" },
      { property: "og:image:height", content: "512" },
      { property: "og:image:alt", content: "Logo de Moneta · Correduría OS" },
      { property: "og:locale", content: "es_ES" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Correduría OS · Moneta Seguros" },
      { name: "twitter:description", content: "CRM + ERP a medida con IA para corredurías de seguros." },
      { name: "twitter:image", content: OG_IMAGE },
      { name: "theme-color", content: "#0f172a" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "apple-mobile-web-app-title", content: "Moneta OS" },
      { name: "mobile-web-app-capable", content: "yes" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/moneta-logo.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/moneta-logo.png" },
      { rel: "canonical", href: SITE_URL },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(STRUCTURED_DATA),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <PermissionsProvider>
          <DialogProvider>
            <Outlet />
            <PwaRegister />
          </DialogProvider>
        </PermissionsProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

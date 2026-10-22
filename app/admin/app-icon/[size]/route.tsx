import { ImageResponse } from "next/og";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ size: string }> },
) {
  const { size: name } = await params;
  const size = (
    { "192.png": 192, "512.png": 512, "180.png": 180 } as Record<string, number>
  )[name];
  if (!size) return new Response("Not found", { status: 404 });
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          background: "#1b1c1b",
          color: "white",
          fontFamily: "sans-serif",
          fontWeight: 700,
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: size * 0.105,
            letterSpacing: size * 0.018,
          }}
        >
          BOX
        </div>
        <div
          style={{
            display: "flex",
            fontSize: size * 0.29,
            color: "#ffc400",
            lineHeight: 1.2,
          }}
        >
          004
        </div>
        <div
          style={{
            display: "flex",
            fontSize: size * 0.053,
            letterSpacing: size * 0.006,
            marginTop: size * 0.035,
          }}
        >
          ADMINISTRACIÓN
        </div>
      </div>
    ),
    {
      width: size,
      height: size,
      headers: { "Cache-Control": "public, max-age=86400" },
    },
  );
}

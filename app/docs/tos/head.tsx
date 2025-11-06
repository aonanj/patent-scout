export default function Head() {
  const canonical = "https://patent-scout.com/docs/tos";
  const description =
    "Understand the Terms of Service governing access to Patent Scout's AI patent search, analytics, and alerting platform.";

  return (
    <>
      <title>Terms of Service | Patent Scout</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />
    </>
  );
}


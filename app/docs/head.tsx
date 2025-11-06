export default function Head() {
  const canonical = "https://patent-scout.com/docs";
  const description =
    "Review Patent Scout legal resources including Terms of Service, Privacy Policy, and Data Processing Agreement for AI patent intelligence customers.";

  return (
    <>
      <title>Legal Documentation | Patent Scout</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />
    </>
  );
}


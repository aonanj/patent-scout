export default function Head() {
  const canonical = "https://patent-scout.com/docs/privacy";
  const description =
    "Learn how Patent Scout collects, processes, and safeguards personal data for AI patent intelligence subscribers in the Privacy Policy.";

  return (
    <>
      <title>Privacy Policy | Patent Scout</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />
    </>
  );
}


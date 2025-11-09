export default function Head() {
  const canonical = "https://patent-scout.com/help";
  const description =
    "Get answers to common Patent Scout questions, from semantic patent search tips to managing automated alerts and IP overview analysis.";

  return (
    <>
      <title>Help Center | Patent Scout</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />
    </>
  );
}

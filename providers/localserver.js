export default {
  name: "LocalServer",

  async search(query) {
    const res = await fetch("http://172.16.50.4/");
    const html = await res.text();

    const doc = new DOMParser().parseFromString(html, "text/html");

    return [...doc.querySelectorAll("a")]
      .map(el => {
        let name = el.innerText.trim();

        name = name
          .replace(/\.(mp4|mkv|avi)$/i, "")
          .replace(/\./g, " ")
          .replace(/\d{3,4}p/g, "")
          .replace(/bluray|webrip|x264|x265/gi, "")
          .trim();

        return {
          title: name,
          url: el.href
        };
      })
      .filter(x =>
        x.url.endsWith(".mp4") ||
        x.url.endsWith(".mkv") ||
        x.url.endsWith(".avi")
      );
  },

  async load(url) {
    return {
      stream: url
    };
  }
};


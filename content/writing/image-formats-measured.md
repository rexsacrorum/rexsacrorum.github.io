---
title: WebP was not worse than JPEG. My decoder was.
heading: WebP was not worse than JPEG. My decoder was.
slug: image-formats-measured
date: 2026-11-16
kicker: Writing · Images
summary: I measured JPEG, WebP and AVIF on 240 images from my own product. My first result said WebP was larger than JPEG at equal quality. That was a decoding bug in my tool. Corrected, WebP needs 71% of the JPEG bytes and AVIF 56.5%.
dek: JPEG, WebP and AVIF, measured on the 240 images my own product serves. My first result said WebP was larger than JPEG at equal quality. That was a decoding bug in my tool. Corrected, WebP needs 71% of the JPEG bytes and AVIF 56.5%.
---

[TeoriaYa](https://teoriaya.com) is my driving-theory trainer. Its questions come with pictures of road signs and road scenes, mostly AI-generated photos with sharp red and blue sign edges. Every picture is served as one file: longest side 1280 px, a watermark stamped on it, JPEG at quality 80.

I wanted a smaller file at the same quality, so I measured JPEG, WebP and AVIF on the product's own images. The first round gave me a headline: at equal quality WebP was larger than JPEG, and AVIF was about half the size. I wrote a draft around it. The first half of that headline was wrong, and the cause was in my measurement tool.

```chart
{"type": "stats", "items": [
  {"value": "56.5%", "label": "of the JPEG bytes: AVIF at the same luma SSIM"},
  {"value": "71%", "label": "of the JPEG bytes: WebP at the same luma SSIM"},
  {"value": "133%", "label": "of the JPEG bytes is what WebP seemed to need through the faulty decoder"},
  {"value": "240", "label": "images, every one the product serves"}
]}
```

## How I measured

The tool is a small Go program that sits in the product's repository and imports the product's own code. For each image it runs the production steps (decode the original, scale it to 1280 px on the longest side, flatten it onto white, stamp the watermark) and gets the exact pixels that go into the encoder. I call that the reference. For all 240 images, the tool's JPEG at quality 80 had the same hash as the file the product serves, so the reference is what learners get.

Then it encodes the reference at many settings and decodes each result again:

- JPEG with Go's standard library, at 4:2:0.
- WebP with libwebp 1.6.0, lossy, method 6.
- AVIF with libavif 1.4.2 and libaom 3.14.1, at speed 6, in 4:2:0 and in 4:4:4.

Quality is luma SSIM against the reference: the standard 11×11 Gaussian window on full-resolution luma, averaged per image and then over the 240 images. Colour is chroma PSNR, in dB. The quality settings of the three formats are not on one scale, so the comparison is file size at equal SSIM: the smallest setting I measured whose mean SSIM is at least that of JPEG at quality 80.

Every file was also scored a second time as Chromium 156 decodes it, with the same metrics in JavaScript. That second pass is how the bug below came out.

Some limits apply to everything below. Chromium is the only browser decoder I checked, not Firefox or Safari. SSIM is a single metric on luma, the colour figure is a PSNR, and nobody compared the images by eye in a controlled test. The images are one kind of content, and other photos may rank the formats differently. The baseline is Go's standard JPEG encoder, because that is what the product ships; a stronger JPEG encoder such as mozjpeg would narrow both gaps.

## What the first run said

A first pass over 180 images said that WebP at quality 80 was about 30% smaller in total than JPEG at quality 80, with a clearly lower SSIM. A second pass over 45 of them said that WebP needed quality 90 to 95 to reach the JPEG's SSIM, and that at those settings it was 18% to 66% larger than the JPEG. I concluded that WebP is smaller only because it is worse.

On 240 images and with the Gaussian SSIM, the same tool path gives the same picture. WebP reaches the JPEG's SSIM only at quality 92, at 133% of the JPEG bytes.

## The bug

The draft tool decoded every encoded file with Go's `image.Decode`. For a WebP file that call lands in the `Decode` function of [gen2brain/webp](https://github.com/gen2brain/webp), the library I used for encoding too. In the version I have (v0.6.4), `Decode` returns libwebp's YUV planes as a Go `image.NYCbCrA`. Those planes are limited range, 16 to 235. Go's colour conversion for that image type assumes full range, 0 to 255, as in a JPEG.

So every decoded WebP was a little washed out. A grey ramp encoded at quality 100 came back with black as 16 and white as 234. SSIM compares against a reference with true black and true white, so every WebP score was pushed down, at every quality setting, by an error that had nothing to do with compression.

The encoded files were fine the whole time. The same library's `DecodeAll` returns libwebp's own RGBA conversion, and on a test image it matches Chromium's decode byte for byte. The path through `Decode` differs from Chromium by up to 107 levels in a channel.

```chart
{"type": "xy", "title": "The same WebP files, scored through two decoders", "caption": "Mean luma SSIM against total size of the 240 images. Each point is one quality setting.",
 "series": [
  {"name": "JPEG", "points": [[27.6, 0.9452, "q70"], [30.4, 0.9518, "q75"], [34.7, 0.9597, "q80"], [40.9, 0.969, "q85"], [51.4, 0.9799, "q90"]]},
  {"name": "WebP, decoded correctly", "points": [[19.9, 0.9483, "q75"], [24.7, 0.9622, "q80"], [30.8, 0.974, "q85"], [36.1, 0.9804, "q88"], [40.5, 0.9844, "q90"], [43.1, 0.9861, "q91"], [46.2, 0.9881, "q92"], [49.7, 0.9894, "q93"], [53.7, 0.9909, "q94"], [57.8, 0.992, "q95"]]},
  {"name": "WebP, through the faulty decode", "points": [[19.9, 0.9201, "q75"], [24.7, 0.9341, "q80"], [30.8, 0.946, "q85"], [36.1, 0.9523, "q88"], [40.5, 0.9563, "q90"], [43.1, 0.9581, "q91"], [46.2, 0.96, "q92"], [49.7, 0.9613, "q93"], [53.7, 0.9628, "q94"], [57.8, 0.9639, "q95"]]}
 ],
 "x_ticks": [0, 10, 20, 30, 40, 50, 60, 70], "y_ticks": [0.9, 0.92, 0.94, 0.96, 0.98, 1.0], "y_format": "{v:.4f}", "y_tick_format": "{v:.2f}",
 "x_label": "total MB", "y_label": "Luma SSIM", "label_name": "Quality", "mark": {"y": 0.9597, "label": "JPEG q80"},
 "tip": "{name}, {label}: {x} MB, SSIM {y}",
 "alt": "Line chart of mean luma SSIM against total megabytes for three series. Decoded correctly, the WebP curve lies above the JPEG curve at every size and crosses the SSIM of JPEG quality 80 near 24 MB. The same WebP files through the faulty decode lie below the JPEG curve and reach that SSIM only at 46 MB.",
 "note": "The two WebP series are the same files at the same sizes. Only the decoder used for scoring differs."}
```

Through the faulty decode, the 240 images give numbers close to the draft's. On the draft's own SSIM variant (8×8 windows), WebP at quality 90 scores 0.9586 and at quality 95 scores 0.9654, against 0.9612 and 0.9674 in the draft. Decoded correctly they score 0.9861 and 0.9928. The JPEG at quality 80 scores 0.9649 on that variant.

```chart
{"type": "bars", "title": "WebP bytes needed to reach the SSIM of JPEG quality 80", "caption": "Share of the JPEG bytes, 240 images.", "max": 133.1,
 "rows": [["Faulty decode, q92", 133.1, "133% · 46.2 MB"], ["JPEG q80", 100, "100% · 34.7 MB"], ["Correct decode, q80", 71.0, "71% · 24.7 MB"]]}
```

Nothing in the first run looked broken: the scores rose with the quality setting, as they should. What exposed it was a second decoder. For WebP and for AVIF in 4:4:4 the browser's scores and the corrected Go scores now agree exactly; for JPEG and AVIF in 4:2:0 the luma agrees to within 0.0001 SSIM.

## The corrected result

```chart
{"type": "xy", "title": "Size against quality, 240 images", "caption": "Mean luma SSIM against total size. Each point is one quality setting.",
 "series": [
  {"name": "JPEG", "points": [[27.6, 0.9452, "q70"], [30.4, 0.9518, "q75"], [34.7, 0.9597, "q80"], [40.9, 0.969, "q85"], [51.4, 0.9799, "q90"]]},
  {"name": "WebP, method 6", "points": [[19.9, 0.9483, "q75"], [20.8, 0.9513, "q76"], [21.7, 0.9541, "q77"], [22.6, 0.9568, "q78"], [23.6, 0.9594, "q79"], [24.7, 0.9622, "q80"], [30.8, 0.974, "q85"], [36.1, 0.9804, "q88"], [40.5, 0.9844, "q90"], [43.1, 0.9861, "q91"], [46.2, 0.9881, "q92"], [49.7, 0.9894, "q93"], [53.7, 0.9909, "q94"], [57.8, 0.992, "q95"]]},
  {"name": "AVIF 4:4:4, speed 6", "points": [[10.2, 0.9186, "q45"], [12.6, 0.9337, "q50"], [15.2, 0.9464, "q55"], [18.8, 0.9589, "q60"], [19.6, 0.9611, "q62"], [20.4, 0.963, "q63"], [21.3, 0.965, "q65"], [26.3, 0.9763, "q70"], [29.8, 0.9809, "q75"]]}
 ],
 "x_ticks": [0, 10, 20, 30, 40, 50, 60], "y_ticks": [0.9, 0.92, 0.94, 0.96, 0.98, 1.0], "y_format": "{v:.4f}", "y_tick_format": "{v:.2f}",
 "x_label": "total MB", "y_label": "Luma SSIM", "label_name": "Quality", "mark": {"y": 0.9597, "label": "JPEG q80"},
 "tip": "{name}, {label}: {x} MB, SSIM {y}",
 "alt": "Line chart of mean luma SSIM against total megabytes for JPEG, WebP and AVIF. At every size AVIF is highest, WebP is in the middle and JPEG is lowest. The curves cross the SSIM of JPEG quality 80 at about 19.6 MB for AVIF, 24.7 MB for WebP and 34.7 MB for JPEG.",
 "note": "Scored with the Go decoders, which agree with Chromium on luma to within 0.0001. AVIF in 4:2:0 has the same luma as 4:4:4 at each setting and is left out. libavif gave byte-identical files for quality 60 and 61 and for 64 and 65, so each pair is one point."}
```

| Encoder | Median | 90th percentile | Total | Share of JPEG | Luma SSIM | Chroma PSNR | Encode time |
| --- | --- | --- | --- | --- | --- | --- | --- |
| JPEG q80 | 142.9 KB | 201.6 KB | 34.72 MB | 100% | 0.9596 | 45.27 dB | 0.02 s |
| WebP q80, method 6 | 98.0 KB | 160.5 KB | 24.67 MB | 71.0% | 0.9622 | 45.38 dB | 0.34 s |
| AVIF q62, 4:2:0 | 76.9 KB | 117.7 KB | 19.17 MB | 55.2% | 0.9611 | 46.08 dB | 1.85 s |
| AVIF q62, 4:4:4 | 78.8 KB | 120.2 KB | 19.62 MB | 56.5% | 0.9611 | 47.53 dB | 2.54 s |

SSIM and chroma PSNR in the table are as Chromium decodes the files. Encode time is per image on one thread.

```chart
{"type": "bars", "title": "Bytes at the SSIM of JPEG quality 80", "caption": "Total of 240 images.", "max": 34.72,
 "rows": [["JPEG q80", 34.72, "34.72 MB · 100%"], ["WebP q80", 24.67, "24.67 MB · 71.0%"], ["AVIF q62, 4:4:4", 19.62, "19.62 MB · 56.5%"]]}
```

WebP at quality 80 is the first WebP setting at or above the JPEG's SSIM. Quality 79 misses by 0.0003 at 67.9% of the bytes, so the exact crossing lies between 67.9% and 71.0%. AVIF at quality 62 is the first AVIF setting above the line; quality 60 falls 0.0007 short at 54.2%.

Both figures are a match on the mean. If I choose for every image the smallest setting that reaches that image's own JPEG score, WebP comes to 74.8% and AVIF to 58.0%. At the fixed quality 62, 103 of the 240 AVIF files score below their own JPEG, the worst by 0.0105.

## Full chroma for 2.3% more bytes

Most lossy images store colour at half resolution in both directions (4:2:0). AVIF can keep it at full resolution (4:4:4). On a road sign the colour edge is the content: a red ring on white, a red bar over a black arrow.

At quality 62 the luma of the two variants is identical. Full chroma costs 2.3% more bytes (19.62 MB against 19.17 MB) and gives 1.44 dB more chroma PSNR as Chromium decodes it. My draft said 1.7 dB. That number came from Go's decoders, which upsample 4:2:0 chroma more crudely than a browser does and so make 4:2:0 look worse than it is on screen.

The figure shows one sign edge from the same image in each format, next to the pixels that went into the encoders.

<figure class="fig">
<figcaption><b>One sign edge, as Chromium decodes each file</b>A 96×96 px region of a "no U-turn" sign, magnified four times. The sizes are those of the whole image.</figcaption>
<div class="shots">
<div><img src="/assets/img/image-formats/reference.png" alt="Crop of the sign before encoding: a red diagonal bar over a black arrow on a white field, with clean edges." width="384" height="384" loading="lazy"><b>Reference</b>before encoding</div>
<div><img src="/assets/img/image-formats/jpeg-q80.png" alt="The same crop from the JPEG at quality 80." width="384" height="384" loading="lazy"><b>JPEG q80</b>167 KB</div>
<div><img src="/assets/img/image-formats/webp-q80.png" alt="The same crop from the WebP at quality 80." width="384" height="384" loading="lazy"><b>WebP q80</b>110 KB</div>
<div><img src="/assets/img/image-formats/avif-q62-420.png" alt="The same crop from the AVIF at quality 62 with 4:2:0 chroma." width="384" height="384" loading="lazy"><b>AVIF q62, 4:2:0</b>86 KB</div>
<div><img src="/assets/img/image-formats/avif-q62-444.png" alt="The same crop from the AVIF at quality 62 with 4:4:4 chroma." width="384" height="384" loading="lazy"><b>AVIF q62, 4:4:4</b>88 KB</div>
</div>
</figure>

## What shipped

AVIF at quality 62, 4:4:4, speed 6, with the existing JPEG as the fallback:

```
<picture>
  <source type="image/avif" srcset="/media/<hash>.avif">
  <img src="/media/<hash>.jpg" alt="...">
</picture>
```

A browser that decodes AVIF takes the first file, and any other browser takes the JPEG. All 240 images have both files, and this has been live on teoriaya.com since 15 November 2026.

There is no WebP in between: two files per image, not three. The site has no real traffic yet, so I have no figure for how many visitors receive the AVIF.

AVIF encoding is slow: 2.5 s per image against 0.02 s for the JPEG, with the encoder compiled to WebAssembly and run on one thread. That is fine for 240 images encoded once, ahead of time. Speed 4 would give slightly better files (SSIM 0.9618 against 0.9590 at quality 60, at almost the same size) for 17.7 s per image, about seven times longer.

The files are stored under a key that is the hash of their bytes, so the encoder has to produce the same bytes every time. It did: a single-threaded run and a parallel one gave the same files, byte for byte, for every setting I compared. The WebP and AVIF libraries prefer a system library when one is installed, which could change the bytes, so the build refuses to encode unless it is pinned to the bundled encoder.

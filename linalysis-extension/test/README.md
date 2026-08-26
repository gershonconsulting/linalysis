# content-metrics tests

    npm install jsdom          # once
    node test/metrics.test.js

Every fixture in `metrics.test.js` is the real structure of a LinkedIn analytics page, captured
live on 2026-08-26 while diagnosing why company followers, unique visitors and profile views had
stopped being collected and why company post impressions was reading 190,000.

Run them against `content-metrics.js` before packing a CRX. They fail on v0.2.7 in exactly the
places production failed, which is the point — they are a record of what went wrong, not a
description of what the code currently does.

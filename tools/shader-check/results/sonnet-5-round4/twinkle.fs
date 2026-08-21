/*{
  "DESCRIPTION": "Twinkling stars scattered across the display in two colours",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 0.85, 0.3, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "density", "TYPE": "float", "MIN": 4.0, "MAX": 40.0, "DEFAULT": 16.0 },
    { "NAME": "sharpness", "TYPE": "float", "MIN": 0.05, "MAX": 1.0, "DEFAULT": 0.35 }
  ]
}*/

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.x, p.y, p.x) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec2 uv = isf_FragNormCoord;

  // Keep the field usable even on a 1-pixel-tall roofline: give it a
  // synthetic vertical extent so we still get a scatter of stars.
  vec2 gridUV = uv;
  if (RENDERSIZE.y < 2.0) {
    gridUV.y = fract(uv.x * 3.17);
  }

  vec2 cellSize = vec2(1.0 / density);
  vec2 cellID = floor(gridUV / cellSize);

  vec3 col = vec3(0.0);

  // check a small neighborhood so star glow can spread past cell edges
  for (int dx = -1; dx <= 1; dx++) {
    for (int dy = -1; dy <= 1; dy++) {
      vec2 neighbor = cellID + vec2(float(dx), float(dy));
      float r = hash(neighbor);

      // random position of star within its cell
      vec2 jitter = vec2(hash(neighbor + 0.11), hash(neighbor + 0.37));
      vec2 starPos = (neighbor + jitter) * cellSize;

      vec2 diff = gridUV - starPos;
      // correct for aspect so stars stay round-ish
      diff.x *= RENDERSIZE.x / max(RENDERSIZE.y, 1.0);
      float d = length(diff);

      // twinkle: each star has its own phase and rate
      float phase = r * 6.2831853;
      float rate = 0.6 + r * 1.4;
      float twinkle = 0.5 + 0.5 * sin(TIME * speed * rate + phase);
      twinkle = pow(twinkle, 2.0);

      float radius = cellSize.x * mix(0.15, 0.45, sharpness) * (0.5 + 0.5 * r);
      float star = smoothstep(radius, 0.0, d) * twinkle;

      // colour choice per star, biased by hash
      vec3 starColor = mix(colorA.rgb, colorB.rgb, step(0.5, hash(neighbor + 0.73)));

      col += starColor * star;
    }
  }

  col = clamp(col, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}

/*{
  "DESCRIPTION": "Four festive lights parade across the strip",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [0.0, 0.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "scale", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "sharp", "TYPE": "float", "MIN": 0.1, "MAX": 10.0, "DEFAULT": 2.0 },
    { "NAME": "count", "TYPE": "long", "MIN": 1, "MAX": 8, "DEFAULT": 4 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  float ry = max(1.0, RENDERSIZE.y);
  // primary axis for motion: along X; when very short vertically this still reads well
  float axis = uv.x;
  float perp = uv.y;
  // prepare counts
  float fcount = max(1.0, float(count));
  const int MAX_LIGHTS = 8;
  vec3 accum = vec3(0.0);
  // base size scaled by user control and display aspect
  float baseSize = 0.08 * scale;
  // motion speed factor (keeps pleasant range)
  float motion = TIME * speed * 0.2;
  for (int i = 0; i < MAX_LIGHTS; i++) {
    // skip unused slots
    if (float(i) >= fcount) {
      continue;
    }
    float fi = float(i);
    // evenly spaced positions that flow smoothly and wrap (seamless)
    float pos = fract((fi + motion) / fcount);
    // circular distance along the axis (wrap-around)
    float d = abs(axis - pos);
    d = min(d, 1.0 - d);
    // soft circular glow in axis direction
    float size = baseSize;
    float edge = size;
    // falloff shaped by smoothstep and sharpened by exponent
    float fall = 1.0 - smoothstep(0.0, edge, d);
    fall = pow(fall, max(0.1, sharp));
    // vertical falloff to give a bead-like appearance
    float vdist = abs(perp - 0.5) * 1.6;
    float vfall = 1.0 - smoothstep(0.0, 0.5, vdist);
    float intensity = fall * vfall;
    // pick color by index cycling through declared colors
    vec3 lightCol;
    int mod3 = i - (i / 3) * 3;
    if (mod3 == 0) {
      lightCol = colorA.rgb;
    } else if (mod3 == 1) {
      lightCol = colorB.rgb;
    } else {
      lightCol = colorC.rgb;
    }
    // additive mixing for bright festive look
    accum += lightCol * intensity * 1.6;
  }
  // clamp and gentle gamma to keep colors vivid
  vec3 outCol = clamp(accum, 0.0, 1.0);
  outCol = pow(outCol, vec3(0.95));
  gl_FragColor = vec4(outCol, 1.0);
}

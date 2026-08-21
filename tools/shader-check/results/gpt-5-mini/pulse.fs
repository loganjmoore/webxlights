/*{
  "DESCRIPTION": "Synchronized pulsing Christmas lights on a steady beat",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [0.0, 0.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "sharpness", "TYPE": "float", "MIN": 0.0, "MAX": 2.0, "DEFAULT": 0.8 },
    { "NAME": "spread", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.2 }
  ]
}*/
const float PI = 3.14159265;

float tri(float x) {
  float f = fract(x);
  return max(0.0, 1.0 - abs(f - 0.5) * 2.0);
}

void main() {
  vec2 uv = isf_FragNormCoord;

  // For very short vertical buffers, treat motion along x (typical roofline)
  float coord = uv.x;
  if (RENDERSIZE.y < 2.0) {
    coord = uv.x;
  }

  // Determine how many palette slots to place across the x axis
  float slots = max(1.0, float(NUMCOLORS));
  float freq = slots * (1.0 + spread * 10.0);

  // Base color distribution across the strand/canvas (mapped along x)
  float k = coord * freq;
  float w0 = tri(k + 0.0);
  float w1 = tri(k + 0.3333333);
  float w2 = tri(k + 0.6666667);
  float wsum = w0 + w1 + w2 + 0.0001;
  vec3 baseCol = (colorA.rgb * w0 + colorB.rgb * w1 + colorC.rgb * w2) / wsum;

  // Global steady beat with slight phase spread across the line
  float phaseOffset = (coord - 0.5) * spread * 0.5; // small per-pixel offset
  float beatRaw = 0.5 + 0.5 * cos(2.0 * PI * (TIME * speed + phaseOffset));
  float pulse = pow(max(0.0, beatRaw), 1.0 + sharpness * 3.0);

  // Keep a little ambient so lights never vanish completely unless pulse is very low
  float ambient = 0.12;
  vec3 finalCol = baseCol * (ambient + (1.0 - ambient) * pulse);

  gl_FragColor = vec4(finalCol, 1.0);
}

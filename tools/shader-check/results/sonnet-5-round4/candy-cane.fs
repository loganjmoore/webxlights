/*{
  "DESCRIPTION": "Diagonal red and white candy cane stripes scrolling across the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "scale", "TYPE": "float", "MIN": 1.0, "MAX": 12.0, "DEFAULT": 5.0 },
    { "NAME": "sharpness", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.7 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;

  float diag;
  if (RENDERSIZE.y < 2.0) {
    // flat roofline: fake diagonal motion using x alone
    diag = uv.x * scale - TIME * speed * 0.6;
  } else {
    diag = (uv.x + uv.y) * scale - TIME * speed * 0.6;
  }

  float stripe = fract(diag);
  float edge = mix(0.02, 0.45, sharpness);
  float band = smoothstep(0.5 - edge, 0.5 + edge, stripe);

  vec3 col = mix(colorA.rgb, colorB.rgb, band);
  gl_FragColor = vec4(col, 1.0);
}

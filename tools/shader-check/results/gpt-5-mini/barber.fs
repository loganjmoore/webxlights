/*{
  "DESCRIPTION": "Spinning barber pole for Christmas lights",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "scale", "TYPE": "float", "MIN": 0.5, "MAX": 20.0, "DEFAULT": 3.0 },
    { "NAME": "sharpness", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.8 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  float height = RENDERSIZE.y;
  // rotation angle (radians)
  float angle = TIME * speed * 6.2831853;
  // center coordinates
  vec2 p = uv - vec2(0.5, 0.5);

  // stripe coordinate value in 0..1
  float val;
  if (height < 2.0) {
    // 1D line (roofline): simulate rotation as lateral motion along x
    float offset = TIME * speed * 0.25;
    val = fract((uv.x + offset) * scale);
  } else {
    // 2D: rotate coordinates around center to spin the barber pole
    float c = cos(angle);
    float s = sin(angle);
    vec2 rp = vec2(p.x * c - p.y * s, p.x * s + p.y * c);
    // use the rotated x to create diagonal stripes
    val = fract(rp.x * scale + 0.5);
  }

  // sharpness mapping: 1.0 = crisp, 0.0 = very soft
  float sh = clamp(sharpness, 0.001, 1.0);
  float transWidth = (1.0 - sh) * 0.45; // transition half-width
  // create high-contrast stripe between 0..1
  float stripe = smoothstep(0.5 - transWidth, 0.5 + transWidth, val);

  // base color mix between two user colors
  vec3 col = mix(colorA.rgb, colorB.rgb, stripe);

  // small glossy highlight along stripe edges for depth
  float edge = max(0.005, 0.02 * (1.0 - sh));
  float d = abs(val - 0.5);
  float spec = clamp((edge - d) / edge, 0.0, 1.0);
  // tint the highlight toward white and keep it subtle
  col = mix(col, vec3(1.0), spec * 0.35);

  gl_FragColor = vec4(col, 1.0);
}

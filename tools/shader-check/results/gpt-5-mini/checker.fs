/*{
  "DESCRIPTION": "Two-color checkerboard sliding sideways",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "scale", "TYPE": "float", "MIN": 1.0, "MAX": 50.0, "DEFAULT": 8.0 },
    { "NAME": "sharpness", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 1.0 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  float aspect = RENDERSIZE.x / max(RENDERSIZE.y, 1.0);

  // Build tile coordinates so tiles stay roughly square in pixel space.
  vec2 st = vec2(uv.x * scale * aspect, uv.y * scale);

  // When the buffer is a single-pixel-tall roofline, drive the animation along X only.
  if (RENDERSIZE.y < 2.0) {
    st.y = 0.0;
  }

  // Slide the pattern sideways (along X).
  st.x -= TIME * speed;

  const float PI = 3.14159265;

  // Use cosine product to make a checker pattern; cos(...) * cos(...) is >0 in one color, <0 in the other.
  float s = cos(PI * st.x) * cos(PI * st.y);

  // Convert the cosine product into a smooth mix factor.
  // sharpness -> smaller edge threshold -> crisper transition.
  float edge = mix(0.01, 0.0005, clamp(sharpness, 0.0, 1.0));
  float t = smoothstep(-edge, edge, s);

  vec3 col = mix(colorA.rgb, colorB.rgb, t);

  gl_FragColor = vec4(col, 1.0);
}

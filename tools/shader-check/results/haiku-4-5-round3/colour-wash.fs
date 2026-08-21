/*{
  "DESCRIPTION": "Smooth color wash that fades between palette colors",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "scale", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  
  float t = mod(TIME * speed * 0.5 + uv.x * scale, float(NUMCOLORS));
  int colorIndex = int(floor(t));
  float blend = fract(t);
  
  vec3 col1 = vec3(0.5);
  vec3 col2 = vec3(0.5);
  
  if (colorIndex == 0 && NUMCOLORS >= 1) {
    col1 = colorA.rgb;
  } else if (colorIndex == 1 && NUMCOLORS >= 2) {
    col1 = colorB.rgb;
  } else if (colorIndex == 2 && NUMCOLORS >= 3) {
    col1 = colorC.rgb;
  } else if (colorIndex == 3 && NUMCOLORS >= 4) {
    col1 = colorD.rgb;
  }
  
  int nextIndex = int(mod(float(colorIndex + 1), float(NUMCOLORS)));
  if (nextIndex == 0 && NUMCOLORS >= 1) {
    col2 = colorA.rgb;
  } else if (nextIndex == 1 && NUMCOLORS >= 2) {
    col2 = colorB.rgb;
  } else if (nextIndex == 2 && NUMCOLORS >= 3) {
    col2 = colorC.rgb;
  } else if (nextIndex == 3 && NUMCOLORS >= 4) {
    col2 = colorD.rgb;
  }
  
  vec3 finalColor = mix(col1, col2, smoothstep(0.0, 1.0, blend));
  
  gl_FragColor = vec4(finalColor, 1.0);
}

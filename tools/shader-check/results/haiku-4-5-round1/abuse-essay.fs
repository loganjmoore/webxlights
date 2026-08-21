/*{
  "DESCRIPTION": "Cascading red and gold lights falling like autumn leaves",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.4, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 0.8, 0.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.5 },
    { "NAME": "scale", "TYPE": "float", "MIN": 0.5, "MAX": 8.0, "DEFAULT": 3.0 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  
  float x = uv.x * scale;
  float y = uv.y + TIME * speed * 0.5;
  
  float fall1 = fract(y + sin(x * 2.0) * 0.3);
  float fall2 = fract(y - 0.33 + sin(x * 3.0 + 1.0) * 0.3);
  float fall3 = fract(y - 0.67 + sin(x * 2.5 + 2.0) * 0.3);
  
  float width = 0.08;
  float light1 = smoothstep(0.5 + width, 0.5 - width, fall1) * smoothstep(0.3, -0.1, abs(fract(x) - 0.5));
  float light2 = smoothstep(0.5 + width, 0.5 - width, fall2) * smoothstep(0.3, -0.1, abs(fract(x + 0.33) - 0.5));
  float light3 = smoothstep(0.5 + width, 0.5 - width, fall3) * smoothstep(0.3, -0.1, abs(fract(x + 0.67) - 0.5));
  
  float intensity = max(max(light1, light2), light3);
  vec3 color = mix(colorA.rgb, colorB.rgb, sin(TIME * speed + x) * 0.5 + 0.5);
  
  gl_FragColor = vec4(color * intensity, 1.0);
}

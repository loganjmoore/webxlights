{
  "DESCRIPTION": "Merry Christmas message cycles through ten languages with colorful text waves",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  
  float cycle = mod(TIME * speed * 0.5, 10.0);
  int lang = int(cycle);
  float blend = fract(cycle);
  
  float wave = sin(uv.x * 8.0 - TIME * speed + uv.y * 4.0) * 0.5 + 0.5;
  float stripe = step(0.4, mod(uv.y + TIME * speed * 0.3, 0.2));
  
  float intensity = smoothstep(0.2, 0.8, wave);
  intensity *= stripe;
  
  vec3 col = mix(colorA.rgb, colorB.rgb, blend);
  col *= intensity + 0.3;
  
  gl_FragColor = vec4(col, 1.0);
}

import {StyleSheet} from 'react-native';
export const C={green:'#16833F',darkGreen:'#0D6931',paleGreen:'#EAF5E7',blue:'#1683D8',orange:'#F59E0B',red:'#E53935',bg:'#F7FAF4',white:'#FFFFFF',gray:'#737A73',border:'#E8ECE6'};
export default StyleSheet.create({screen:{flex:1,backgroundColor:C.bg},content:{paddingBottom:28},title:{fontSize:27,fontWeight:'800',color:C.darkGreen},subtitle:{fontSize:14,color:C.gray,marginTop:3},sectionTitle:{fontSize:20,fontWeight:'800',color:C.darkGreen},card:{backgroundColor:C.white,borderRadius:18},row:{flexDirection:'row',alignItems:'center'}});
